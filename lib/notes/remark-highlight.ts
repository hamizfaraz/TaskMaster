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
 * Only `text` nodes are rewritten. `remark-math` and the Markdown parser have
 * already lifted code spans, fenced code, and math into their own node types
 * whose content is a `value` rather than `text` children, so those are skipped
 * without needing an explicit exclusion — which is what keeps
 * `s[ root1 ] == s[ root2 ]` in a code fence from becoming a highlight.
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

/** Split one text node into text and `<mark>` nodes. Returns null when unchanged. */
function splitHighlights(node: TextNode): unknown[] | null {
  HIGHLIGHT_RE.lastIndex = 0;
  if (!HIGHLIGHT_RE.test(node.value)) {
    return null;
  }

  const out: unknown[] = [];
  let cursor = 0;
  HIGHLIGHT_RE.lastIndex = 0;

  for (const match of node.value.matchAll(HIGHLIGHT_RE)) {
    const start = match.index ?? 0;
    const inner = (match[1] ?? "").trim();
    if (!inner) {
      continue;
    }

    if (start > cursor) {
      out.push({ type: "text", value: node.value.slice(cursor, start) });
    }
    out.push({
      type: "highlight",
      // `data.hName` is how mdast asks remark-rehype for a specific element.
      data: { hName: "mark" },
      children: [{ type: "text", value: inner }],
    });
    cursor = start + match[0].length;
  }

  if (out.length === 0) {
    return null;
  }

  if (cursor < node.value.length) {
    out.push({ type: "text", value: node.value.slice(cursor) });
  }

  return out;
}

export function remarkHighlight() {
  return (tree: unknown) => {
    const walk = (node: unknown) => {
      if (!isParent(node)) {
        return;
      }

      const next: unknown[] = [];
      let changed = false;

      for (const child of node.children) {
        if (isTextNode(child)) {
          const split = splitHighlights(child);
          if (split) {
            next.push(...split);
            changed = true;
            continue;
          }
        }
        walk(child);
        next.push(child);
      }

      if (changed) {
        node.children = next;
      }
    };

    walk(tree);
  };
}
