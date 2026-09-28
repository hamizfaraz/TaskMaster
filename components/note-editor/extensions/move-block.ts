import { EditorSelection, type StateCommand } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { moveLineDown, moveLineUp } from "@codemirror/commands";

/**
 * Move the construct the cursor is in, not just the line it is on.
 *
 * Block drag-and-drop was removed with the old editor and deliberately not
 * restored: this is a Markdown-native editor, and Obsidian — the stated model —
 * has no such thing either. But `Alt+↑/↓` moving a single line is a poor
 * substitute, because the things people want to reorder are list items with
 * their children, fenced code, display math, and tables, none of which are one
 * line. This makes the keys move the whole construct, falling back to
 * CodeMirror's line move for ordinary prose.
 */

export type BlockRange = { from: number; to: number };

const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s/;
const FENCE_RE = /^\s*(```|~~~)/;
const TABLE_ROW_RE = /^\s*\|/;

/** Indentation width of a line, tabs counted as one. */
function indentOf(text: string) {
  return (text.match(/^[ \t]*/)?.[0] ?? "").length;
}

/**
 * The block containing `pos`, or null when the line is ordinary prose and the
 * plain line move is the right behaviour.
 */
export function blockAt(doc: Text, pos: number): BlockRange | null {
  const line = doc.lineAt(pos);
  const text = line.text;

  // A fenced code block: walk out to its delimiters.
  const fenceScan = scanDelimited(doc, line.number, (value) => FENCE_RE.test(value));
  if (fenceScan) {
    return fenceScan;
  }

  // Display math, delimited by lines that are exactly `$$`.
  const mathScan = scanDelimited(doc, line.number, (value) => value.trim() === "$$");
  if (mathScan) {
    return mathScan;
  }

  // A table: the run of contiguous rows around this one.
  if (TABLE_ROW_RE.test(text)) {
    let first = line.number;
    let last = line.number;
    while (first > 1 && TABLE_ROW_RE.test(doc.line(first - 1).text)) first -= 1;
    while (last < doc.lines && TABLE_ROW_RE.test(doc.line(last + 1).text)) last += 1;
    return { from: doc.line(first).from, to: doc.line(last).to };
  }

  // A list item: the marker line plus everything indented beneath it.
  const marker = text.match(LIST_ITEM_RE);
  if (marker) {
    const baseIndent = marker[1]!.length;
    let last = line.number;
    while (last < doc.lines) {
      const next = doc.line(last + 1);
      if (!next.text.trim()) break;
      const nextIsItem = LIST_ITEM_RE.test(next.text);
      const deeper = indentOf(next.text) > baseIndent;
      if (nextIsItem && !deeper) break; // a sibling starts here
      if (!nextIsItem && !deeper) break; // prose at the same level
      last += 1;
    }
    return { from: line.from, to: doc.line(last).to };
  }

  return null;
}

/** A block delimited by a matching opening and closing line, e.g. ``` or $$. */
function scanDelimited(
  doc: Text,
  lineNumber: number,
  isDelimiter: (text: string) => boolean,
): BlockRange | null {
  // Count delimiters above: an odd number means this line is inside one.
  let opening: number | null = null;
  for (let n = lineNumber; n >= 1; n -= 1) {
    if (isDelimiter(doc.line(n).text)) {
      let above = 0;
      for (let m = n - 1; m >= 1; m -= 1) {
        if (isDelimiter(doc.line(m).text)) above += 1;
      }
      if (above % 2 === 0) {
        opening = n;
      }
      break;
    }
  }
  if (opening === null) {
    return null;
  }

  for (let n = opening + 1; n <= doc.lines; n += 1) {
    if (isDelimiter(doc.line(n).text)) {
      return { from: doc.line(opening).from, to: doc.line(n).to };
    }
  }
  // Unterminated: treat the rest of the document as the block.
  return { from: doc.line(opening).from, to: doc.line(doc.lines).to };
}

function moveBlock(direction: -1 | 1): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    const block = blockAt(state.doc, range.head);
    if (!block) {
      return false; // prose: let the line move handle it
    }

    const startLine = state.doc.lineAt(block.from).number;
    const endLine = state.doc.lineAt(block.to).number;

    // The neighbour to swap with, skipping any blank lines between them.
    let neighbourLine = direction === -1 ? startLine - 1 : endLine + 1;
    while (
      neighbourLine >= 1 &&
      neighbourLine <= state.doc.lines &&
      !state.doc.line(neighbourLine).text.trim()
    ) {
      neighbourLine += direction;
    }
    if (neighbourLine < 1 || neighbourLine > state.doc.lines) {
      return false;
    }

    const neighbour = blockAt(state.doc, state.doc.line(neighbourLine).from) ?? {
      from: state.doc.line(neighbourLine).from,
      to: state.doc.line(neighbourLine).to,
    };

    const first = direction === -1 ? neighbour : block;
    const second = direction === -1 ? block : neighbour;
    const separator = state.doc.sliceString(first.to, second.from);
    const firstText = state.doc.sliceString(first.from, first.to);
    const secondText = state.doc.sliceString(second.from, second.to);

    const insert = `${secondText}${separator}${firstText}`;
    // Keep the cursor the same distance into the block it was in.
    const offsetInBlock = range.head - block.from;
    const movedFrom = direction === -1 ? first.from : first.from + secondText.length + separator.length;

    dispatch(
      state.update({
        changes: { from: first.from, to: second.to, insert },
        selection: EditorSelection.cursor(movedFrom + offsetInBlock),
        userEvent: "move.block",
        scrollIntoView: true,
      }),
    );
    return true;
  };
}

export const moveBlockUp = moveBlock(-1);
export const moveBlockDown = moveBlock(1);

/**
 * Installed ahead of `defaultKeymap`, which binds these to a single-line move.
 * Each command returns false for ordinary prose so the line move still runs.
 */
export function moveBlockKeymap() {
  return keymap.of([
    { key: "Alt-ArrowUp", run: (view) => moveBlockUp(view) || moveLineUp(view), preventDefault: true },
    { key: "Alt-ArrowDown", run: (view) => moveBlockDown(view) || moveLineDown(view), preventDefault: true },
  ]);
}
