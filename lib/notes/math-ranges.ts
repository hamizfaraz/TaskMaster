import { normalizeLatex } from "@/lib/math/latex";

/**
 * Shared, code-aware LaTeX region scanner for Markdown.
 *
 * Used by the server (to normalize typed math on write) and by the editor (to
 * decide what renders as math), so the two never disagree. Finds `$$…$$`
 * (display, may span lines) and `$…$` (inline, single line); skips fenced
 * code blocks and inline code; requires a closing delimiter.
 *
 * Inline math follows Pandoc's rule (see `isInlineMathCandidate`), which
 * `lib/notes/parse-markdown.ts` shares so the derived block cache agrees.
 */

export type MathRange = {
  /** Offset of the opening delimiter. */
  from: number;
  /** Offset just past the closing delimiter. */
  to: number;
  /** Offsets of the LaTeX between the delimiters. */
  contentFrom: number;
  contentTo: number;
  display: boolean;
  latex: string;
};

export type ExcludedRange = {
  from: number;
  to: number;
};

/**
 * Pandoc's inline-math rule: the opening `$` must be followed by a non-space,
 * the closing `$` must be preceded by a non-space, and the closing `$` must
 * not be immediately followed by a digit. This keeps `$5 and $6` and
 * `$HOME and $PATH` as prose while `$x$` and `$x_1 + x_2$` are math.
 */
export function isInlineMathCandidate(inner: string, charAfterClose: string | undefined) {
  if (!inner || /^\s/.test(inner) || /\s$/.test(inner)) {
    return false;
  }
  return charAfterClose === undefined || !/\d/.test(charAfterClose);
}

/** Fenced code blocks (``` / ~~~) and inline code spans, as offset ranges. */
export function findCodeRanges(text: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = [];
  let index = 0;
  let fence: { marker: string; from: number } | null = null;

  while (index <= text.length) {
    const lineEnd = text.indexOf("\n", index);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(index, end);

    if (fence) {
      if (line.startsWith(fence.marker)) {
        ranges.push({ from: fence.from, to: end });
        fence = null;
      }
    } else {
      const open = line.match(/^(`{3,}|~{3,})/);
      if (open) {
        fence = { marker: open[1]!, from: index };
      } else {
        // Inline code: a run of backticks closed by the same-length run.
        const spans = /(`+)([^`\n]|[^`\n][\s\S]*?[^`\n])\1(?!`)/g;
        for (const match of line.matchAll(spans)) {
          ranges.push({ from: index + match.index, to: index + match.index + match[0].length });
        }
      }
    }

    if (lineEnd === -1) {
      break;
    }
    index = lineEnd + 1;
  }

  if (fence) {
    ranges.push({ from: fence.from, to: text.length }); // unterminated fence runs to EOF
  }

  return ranges;
}

export function findMathRanges(text: string, extraExcluded: readonly ExcludedRange[] = []): MathRange[] {
  const excluded = [...findCodeRanges(text), ...extraExcluded];
  const overlapsExcluded = (from: number, to: number) =>
    excluded.some((range) => from < range.to && to > range.from);
  const ranges: MathRange[] = [];

  let index = 0;
  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      index += 2; // an escaped character (e.g. `\$`) never opens math
      continue;
    }

    if (char !== "$") {
      index += 1;
      continue;
    }

    // Display math: $$ … $$
    if (text[index + 1] === "$") {
      const close = text.indexOf("$$", index + 2);
      if (close === -1) {
        index += 2;
        continue;
      }

      const latex = text.slice(index + 2, close).trim();
      const to = close + 2;
      if (latex && !overlapsExcluded(index, to)) {
        ranges.push({ from: index, to, contentFrom: index + 2, contentTo: close, display: true, latex });
      }
      index = to;
      continue;
    }

    // Inline math: $ … $ on one line; the closer must not be part of a `$$`.
    const lineEnd = text.indexOf("\n", index);
    const limit = lineEnd === -1 ? text.length : lineEnd;
    let cursor = index + 1;
    while (cursor < limit && text[cursor] !== "$") {
      cursor += text[cursor] === "\\" ? 2 : 1;
    }

    if (cursor >= limit || text[cursor + 1] === "$") {
      index += 1;
      continue;
    }

    const inner = text.slice(index + 1, cursor);
    const to = cursor + 1;
    if (isInlineMathCandidate(inner, text[to]) && !overlapsExcluded(index, to)) {
      ranges.push({
        from: index,
        to,
        contentFrom: index + 1,
        contentTo: cursor,
        display: false,
        latex: inner.trim(),
      });
    }
    index = to;
  }

  return ranges;
}

/**
 * Normalize typed math (`√(x²) ≤ π` → `\sqrt{x^2} \le \pi`) inside math
 * regions only. Prose and code are byte-for-byte untouched. Display math is
 * normalized line by line so multi-line LaTeX keeps its layout.
 */
export function normalizeMarkdownMath(markdown: string): string {
  const ranges = findMathRanges(markdown);
  if (ranges.length === 0) {
    return markdown;
  }

  let result = markdown;
  for (const range of [...ranges].reverse()) {
    const inner = result.slice(range.contentFrom, range.contentTo);
    const normalized = range.display
      ? inner
          .split("\n")
          .map((line) => normalizeLatex(line))
          .join("\n")
      : normalizeLatex(inner);
    result = result.slice(0, range.contentFrom) + normalized + result.slice(range.contentTo);
  }

  return result;
}
