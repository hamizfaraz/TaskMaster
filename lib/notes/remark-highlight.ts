/**
 * Render Obsidian's `==highlight==` as `<mark>`.
 *
 * `remark-gfm` does not cover `==`, so without this a highlight the user can
 * see in the editor shows up as literal equals signs everywhere else — in
 * flashcards, in quizzes, in any read-only note view.
 *
 * The tree is walked by hand rather than pulling in `unist-util-visit`: the
 * traversal is a dozen lines and the dependency is not otherwise used.
 *
 * Match delimiters across sibling text, formatting, and inline math nodes.
 * Code and math values stay opaque so their equals signs are never treated
 * as highlight delimiters.
 *
 * Must run after `remark-math`, or `$a == b$` would be split before the math
 * node exists.
 */

type TextNode = { type: "text"; value: string };
type ParentNode = { type: string; children?: unknown[]; value?: unknown };

/** Mirrors `HIGHLIGHT_RE` in `lib/notes/highlights.ts`. */
const HIGHLIGHT_RE = /==((?:[^=\n]|=(?!=))+?)==/g;

function isTextNode(node: unknown): node is TextNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: unknown }).type === "text" &&
    typeof (node as { value?: unknown }).value === "string"
  );
}

function isParent(node: unknown): node is ParentNode & { children: unknown[] } {
  return (
    typeof node === "object" &&
    node !== null &&
    Array.isArray((node as { children?: unknown }).children)
  );
}

/** Keep inline nodes intact while matching markers across their boundaries. */
function splitHighlights(children: unknown[]): unknown[] {
  const pieces = children.map((node) => ({
    node,
    text: isTextNode(node) ? node.value :
      (node as { type?: string })?.type === "break" ? "\n" : "\uFFFC",
  }));
  const source = pieces.map((piece) => piece.text).join("");
  const slice = (from: number, to: number) => {
    const result: unknown[] = [];
    let offset = 0;
    for (const piece of pieces) {
      const end = offset + piece.text.length;
      if (offset < to && end > from) {
        result.push(isTextNode(piece.node)
          ? { type: "text", value: piece.text.slice(Math.max(0, from - offset), to - offset) }
          : piece.node);
      }
      offset = end;
    }
    return result;
  };

  const out: unknown[] = [];
  let cursor = 0;
  HIGHLIGHT_RE.lastIndex = 0;
  for (const match of source.matchAll(HIGHLIGHT_RE)) {
    if (!match[1]?.trim()) continue;
    const start = match.index;
    out.push(...slice(cursor, start));
    out.push({
      type: "highlight",
      data: { hName: "mark" },
      children: slice(start + 2, start + match[0].length - 2),
    });
    cursor = start + match[0].length;
  }
  if (cursor === 0) return children;
  out.push(...slice(cursor, source.length));
  return out;
}

export function remarkHighlight() {
  return (tree: unknown) => {
    const walk = (node: unknown) => {
      if (!isParent(node)) return;
      for (const child of node.children) walk(child);
      node.children = splitHighlights(node.children);
    };
    walk(tree);
  };
}
