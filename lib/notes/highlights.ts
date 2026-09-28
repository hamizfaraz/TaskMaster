import { findCodeRanges, findMathRanges, type ExcludedRange } from "@/lib/notes/math-ranges";

/**
 * A span the user marked with `==…==`.
 *
 * Highlights are stored in the canonical markdown rather than a schema column:
 * they round-trip for free, need no migration, and match Obsidian's syntax.
 * This is the only reader outside the editor decoration, so it deliberately
 * uses the same exclusions the editor does — otherwise the two would disagree
 * about what is highlighted.
 */
export type NoteHighlight = {
  /** The marked text, delimiters stripped and trimmed. */
  text: string;
  /** Offsets of the whole `==…==` run in the markdown it came from. */
  from: number;
  to: number;
};

/**
 * `==` is not Markdown, so it has no escaping rules of its own and appears in
 * ordinary code: the one `==` in this project's note corpus is
 * `s[ root1 ] == s[ root2 ]` inside a fence. A run only counts when it is
 * outside code and math, holds no newline, and has something in it.
 *
 * The content may contain a single `=` — `==energy $E = mc^2$==` is a perfectly
 * reasonable highlight — but never `==`, so adjacent highlights on one line
 * stay separate.
 */
const HIGHLIGHT_RE = /==((?:[^=\n]|=(?!=))+?)==/g;

function insideAny(ranges: readonly ExcludedRange[], from: number, to: number) {
  return ranges.some((range) => from >= range.from && to <= range.to);
}

/** Every `==…==` run in `markdown`, in document order. */
export function findHighlightRanges(markdown: string): NoteHighlight[] {
  const codeRanges = findCodeRanges(markdown);
  const mathRanges = findMathRanges(markdown, codeRanges);
  const highlights: NoteHighlight[] = [];

  HIGHLIGHT_RE.lastIndex = 0;
  for (const match of markdown.matchAll(HIGHLIGHT_RE)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (insideAny(codeRanges, from, to) || insideAny(mathRanges, from, to)) {
      continue;
    }

    const text = (match[1] ?? "").trim();
    if (text) {
      highlights.push({ text, from, to });
    }
  }

  return highlights;
}

/**
 * The highlighted text of a note, de-duplicated and capped.
 *
 * Downstream consumers (quiz and flashcard generation) want the phrases, not
 * the offsets. The cap keeps a pathologically highlighted note from crowding
 * the rest of the prompt out of the context window.
 */
export function extractHighlights(markdown: string, limit = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const highlight of findHighlightRanges(markdown)) {
    const key = highlight.text.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(highlight.text);
    if (out.length >= limit) {
      break;
    }
  }

  return out;
}
