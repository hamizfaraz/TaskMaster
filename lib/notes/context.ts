import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { extractHighlights } from "@/lib/notes/highlights";

/**
 * The contract between notes and everything that generates from them.
 *
 * This replaces two byte-identical copies that lived in `lib/quizzes/` and
 * `lib/flashcards/` and had no tests. Issue #9 closed with "the contract is
 * documented and test-covered" unmet; this module is that contract.
 *
 * `highlights` is what the student marked with `==…==`. Per #89 an explicit
 * highlight is the strongest available signal of what they think matters, so
 * generation is told to cover these before drawing on the surrounding prose.
 */
export type NoteContext = {
  id: string;
  title: string;
  /** Trimmed to `MAX_MARKDOWN_CHARS_PER_NOTE`. */
  markdown: string;
  /** Empty when the note has never been embedded. */
  embedding: number[];
  /** Phrases the user marked as important, de-duplicated and in document order. */
  highlights: string[];
};

/** Notes are truncated rather than dropped, so a long note still contributes. */
export const MAX_MARKDOWN_CHARS_PER_NOTE = 18_000;

/** At most this many notes contribute to one generation. */
export const MAX_CONTEXT_NOTES = 12;

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

/**
 * Load the notes a generation should draw on, scoped to their owner.
 *
 * Returns fewer rows than asked for when an id is unknown or belongs to
 * someone else; callers compare lengths to tell the difference.
 */
export async function getNoteContext(params: {
  userId: string;
  noteIds: string[];
}): Promise<NoteContext[]> {
  const uniqueNoteIds = Array.from(new Set(params.noteIds)).slice(0, MAX_CONTEXT_NOTES);
  if (uniqueNoteIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: note.id,
      title: note.title,
      markdown: note.markdown,
      embedding: note.embedding,
    })
    .from(note)
    .where(
      and(
        eq(note.userId, params.userId),
        inArray(note.id, uniqueNoteIds),
        isNull(note.deletedAt),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    // Highlights come from the full text: truncation must not silently drop
    // the very phrases generation is told to prioritise.
    highlights: extractHighlights(row.markdown),
    markdown: row.markdown.trim().slice(0, MAX_MARKDOWN_CHARS_PER_NOTE),
    embedding: normalizeEmbedding(row.embedding),
  }));
}
