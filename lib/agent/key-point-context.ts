import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, parseTestConcept, parseTestCourse, parseTestGradingItem } from "@/lib/db/schema";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { detectHighlightSuggestions } from "@/lib/notes/detect-highlights";
import { findHighlightRanges } from "@/lib/notes/highlights";
import { findCodeRanges, findMathRanges } from "@/lib/notes/math-ranges";

/**
 * The read-only context a key-point agent is allowed to see.
 *
 * Every function here takes `userId` as its **first parameter, supplied by the
 * route from the session**. It is never a model-controlled value. A
 * model-supplied user id is a direct path to reading another account's notes,
 * so the tool wrappers in `key-point-agent.ts` close over it rather than
 * accepting it in a schema.
 */

export type AgentNote = {
  id: string;
  title: string;
  markdown: string;
  classId: string | null;
};

/** The note, only if this user owns it. */
export async function getOwnedNote(userId: string, noteId: string): Promise<AgentNote | null> {
  const [row] = await db
    .select({ id: note.id, title: note.title, markdown: note.markdown, classId: note.classId })
    .from(note)
    .where(and(eq(note.id, noteId), eq(note.userId, userId)))
    .limit(1);

  return row ?? null;
}

export type SyllabusContext = {
  courseTitle: string | null;
  /** Concepts the syllabus itself names, in its own order. */
  concepts: string[];
  /** Assessments and their weight, heaviest first. */
  grading: { label: string; weightPercent: number }[];
};

/**
 * What the course says matters. This is the signal the ranker cannot see:
 * a note whose subject the syllabus names, in a course whose exams carry most
 * of the grade, contains something worth marking even when its text offers no
 * lexical cue.
 */
export async function getSyllabusContext(
  userId: string,
  noteId: string,
): Promise<SyllabusContext | null> {
  const owned = await getOwnedNote(userId, noteId);
  if (!owned?.classId) {
    return null;
  }

  // Ownership of the class is checked separately: a note could carry a stale
  // class id, and the course tree hangs off a different user column.
  const course = await assertClassBelongsToUser(owned.classId, userId);
  if (!course) {
    return null;
  }

  const [courseRow, concepts, grading] = await Promise.all([
    db
      .select({ title: parseTestCourse.title, courseCode: parseTestCourse.courseCode })
      .from(parseTestCourse)
      .where(eq(parseTestCourse.id, owned.classId))
      .limit(1),
    db
      .select({ label: parseTestConcept.label })
      .from(parseTestConcept)
      .where(eq(parseTestConcept.courseId, owned.classId))
      .orderBy(asc(parseTestConcept.displayOrder)),
    db
      .select({ label: parseTestGradingItem.label, weightPercent: parseTestGradingItem.weightPercent })
      .from(parseTestGradingItem)
      .where(eq(parseTestGradingItem.courseId, owned.classId))
      .orderBy(desc(parseTestGradingItem.weightPercent)),
  ]);

  const found = courseRow[0];
  return {
    courseTitle: found ? [found.courseCode, found.title].filter(Boolean).join(" ") : null,
    concepts: concepts.map((row) => row.label),
    grading,
  };
}

/** Titles of the user's other notes in the same course, newest first. */
export async function getSiblingNoteTitles(
  userId: string,
  noteId: string,
  limit = 20,
): Promise<string[]> {
  const owned = await getOwnedNote(userId, noteId);
  if (!owned?.classId) {
    return [];
  }

  const rows = await db
    .select({ title: note.title })
    .from(note)
    .where(and(eq(note.userId, userId), eq(note.classId, owned.classId), ne(note.id, noteId)))
    .orderBy(desc(note.updatedAt))
    .limit(limit);

  return rows.map((row) => row.title);
}

/** The free ranker's view of the note, handed to the agent as a prior. */
export function getRankerCandidates(markdown: string) {
  return detectHighlightSuggestions(markdown).map((suggestion) => ({
    text: suggestion.text,
    kind: suggestion.kind,
    score: suggestion.score,
  }));
}

export type SpanVerdict = {
  text: string;
  ok: boolean;
  /** Why it was rejected, for the agent to act on. */
  problem?: string;
  from?: number;
  to?: number;
};

/**
 * Can this text be highlighted, exactly as written?
 *
 * The deterministic layer shipped a bug that only this check catches: 24 of
 * 115 suggestions named spans that could never be wrapped in `==…==`. An agent
 * inventing or paraphrasing text is far likelier to produce one, so nothing it
 * proposes is trusted until it survives this.
 */
export function verifySpans(markdown: string, texts: readonly string[]): SpanVerdict[] {
  const codeRanges = findCodeRanges(markdown);
  const mathRanges = findMathRanges(markdown, codeRanges);
  const existing = findHighlightRanges(markdown);
  const claimed: { from: number; to: number }[] = [];

  return texts.map((raw) => {
    const text = raw.trim();
    if (!text) {
      return { text: raw, ok: false, problem: "empty" };
    }
    if (text.includes("\n")) {
      return { text, ok: false, problem: "spans more than one line; a highlight cannot" };
    }

    const from = markdown.indexOf(text);
    if (from === -1) {
      return { text, ok: false, problem: "does not appear verbatim in the note" };
    }
    if (markdown.indexOf(text, from + 1) !== -1) {
      return { text, ok: false, problem: "appears more than once; quote more surrounding text" };
    }

    const to = from + text.length;
    const inside = (ranges: readonly { from: number; to: number }[]) =>
      ranges.some((range) => from >= range.from && to <= range.to);

    if (inside(codeRanges)) {
      return { text, ok: false, problem: "inside code" };
    }
    if (inside(mathRanges)) {
      return { text, ok: false, problem: "inside math" };
    }
    if (existing.some((range) => from < range.to && to > range.from)) {
      return { text, ok: false, problem: "already highlighted" };
    }
    if (claimed.some((range) => from < range.to && to > range.from)) {
      return { text, ok: false, problem: "overlaps another span in this batch" };
    }

    claimed.push({ from, to });
    return { text, ok: true, from, to };
  });
}
