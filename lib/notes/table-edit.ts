/**
 * Structural edits to a GFM table, as pure functions over its markdown.
 *
 * Parsing and serialization deliberately route through the existing note
 * pipeline — `parseMarkdownToNoteDocument` already understands `\|` escapes and
 * alignment rows, and `serializeNoteDocumentToMarkdown` already emits the exact
 * shape the generator produces. Reimplementing either here would create a second
 * table dialect that drifts from the one the note is stored in.
 *
 * `rows[0]` is the header row. GFM tables always have one, so it can be edited
 * but never removed.
 */
import { parseMarkdownToNoteDocument, serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import { findCodeRanges } from "@/lib/notes/math-ranges";
import type { NoteTableAlignment } from "@/lib/notes/types";

export type TableModel = {
  /** `rows[0]` is the header; the rest are body rows. Always rectangular. */
  rows: string[][];
  /** One entry per column. */
  align: NoteTableAlignment[];
};

export type TableRange = { from: number; to: number };

const TABLE_ROW_RE = /^\s*\|/;
const DELIMITER_CELL_RE = /^:?-+:?$/;

/** Cells of a GFM row, honouring `\|`. Mirrors the parser's own splitter. */
function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (body[index] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += body[index];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isDelimiterRow(line: string | undefined) {
  if (line === undefined || !line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL_RE.test(cell));
}

/**
 * Every table in the document, excluding any inside a code fence — a fenced
 * markdown example is text to read, not a table to edit.
 */
export function findTableRanges(text: string): TableRange[] {
  const excluded = findCodeRanges(text);
  const lines = text.split("\n");
  const ranges: TableRange[] = [];

  // Running offset of the start of each line.
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  let index = 0;
  while (index < lines.length) {
    const header = lines[index] ?? "";
    if (!header.includes("|") || !isDelimiterRow(lines[index + 1])) {
      index += 1;
      continue;
    }

    let last = index + 1;
    while (last + 1 < lines.length && TABLE_ROW_RE.test(lines[last + 1] ?? "")) {
      last += 1;
    }

    const from = lineStarts[index]!;
    const to = lineStarts[last]! + (lines[last] ?? "").length;
    // Containment, not overlap. `findCodeRanges` reports inline code spans as
    // well as fences, and a cell holding `code` overlaps the table it sits in —
    // testing for overlap dropped every table that contained an inline code
    // span. Only a fence that encloses the whole table should exclude it.
    const insideFence = excluded.some((range) => range.from <= from && range.to >= to);
    if (!insideFence) ranges.push({ from, to });
    index = last + 1;
  }

  return ranges;
}

/** Pad every row to the widest, so the model is always rectangular. */
function squareUp(rows: string[][], align: NoteTableAlignment[]): TableModel {
  const width = Math.max(1, ...rows.map((row) => row.length), align.length);
  return {
    rows: rows.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? "")),
    align: Array.from({ length: width }, (_, column) => align[column] ?? null),
  };
}

/** Parse a table region's markdown. Returns null when it is not a table. */
export function parseTableModel(markdown: string): TableModel | null {
  const blocks = parseMarkdownToNoteDocument(markdown).blocks;
  const block = blocks.length === 1 ? blocks[0] : undefined;
  if (!block || block.type !== "table") return null;
  return squareUp(block.data.rows, block.data.align ?? []);
}

/** Back to markdown, through the serializer the rest of the pipeline uses. */
export function serializeTableModel(model: TableModel): string {
  const square = squareUp(model.rows, model.align);
  return serializeNoteDocumentToMarkdown({
    time: 0,
    blocks: [{ type: "table", data: { rows: square.rows, align: square.align } }],
  });
}

export function columnCount(model: TableModel) {
  return model.align.length;
}

/** Body rows only; the header is not counted. */
export function bodyRowCount(model: TableModel) {
  return Math.max(0, model.rows.length - 1);
}

/**
 * Insert a blank body row so it becomes row `index`.
 *
 * Clamped to 1 at the low end: inserting at 0 would push the header into the
 * body, and a GFM table with no header cannot be serialized.
 */
export function insertRow(model: TableModel, index: number): TableModel {
  const at = Math.min(Math.max(index, 1), model.rows.length);
  const blank = Array.from({ length: columnCount(model) }, () => "");
  const rows = [...model.rows];
  rows.splice(at, 0, blank);
  return { rows, align: [...model.align] };
}

/** Remove a body row. The header (index 0) is never removable. */
export function deleteRow(model: TableModel, index: number): TableModel {
  if (index < 1 || index >= model.rows.length) return model;
  const rows = [...model.rows];
  rows.splice(index, 1);
  return { rows, align: [...model.align] };
}

/** Insert a blank column so it becomes column `index`. */
export function insertColumn(model: TableModel, index: number): TableModel {
  const at = Math.min(Math.max(index, 0), columnCount(model));
  const align = [...model.align];
  align.splice(at, 0, null);
  return {
    rows: model.rows.map((row) => {
      const next = [...row];
      next.splice(at, 0, "");
      return next;
    }),
    align,
  };
}

/**
 * Remove a column. Refused when it is the last one: a table with no columns has
 * no markdown representation, so the caller would be deleting the table by
 * accident rather than on purpose.
 */
export function deleteColumn(model: TableModel, index: number): TableModel {
  if (columnCount(model) <= 1 || index < 0 || index >= columnCount(model)) return model;
  const align = [...model.align];
  align.splice(index, 1);
  return {
    rows: model.rows.map((row) => {
      const next = [...row];
      next.splice(index, 1);
      return next;
    }),
    align,
  };
}

/** Cycle a column's alignment: none → left → center → right → none. */
export function cycleAlignment(model: TableModel, index: number): TableModel {
  if (index < 0 || index >= columnCount(model)) return model;
  const order: NoteTableAlignment[] = [null, "left", "center", "right"];
  const next = order[(order.indexOf(model.align[index] ?? null) + 1) % order.length]!;
  const align = [...model.align];
  align[index] = next;
  return { rows: model.rows.map((row) => [...row]), align };
}

/**
 * Escape a cell's text for the markdown table.
 *
 * Must match `serializeTableCell` in `lib/notes/markdown.ts`: a raw `|` would
 * split the cell into two, and a newline would end the row. Kept here as well so
 * in-place cell edits escape identically to a full re-serialization.
 */
export function escapeCellText(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * The span of a cell's text inside its source line, excluding the padding spaces
 * the serializer writes around it.
 *
 * This is what makes typing in a cell a small edit rather than a rewrite of the
 * whole table: only the cell's own characters are replaced, so the history keeps
 * coalescing keystrokes and the rest of the row is untouched.
 */
export function cellRangeInLine(line: string, columnIndex: number): { from: number; to: number } {
  const start = cellOffsetInLine(line, columnIndex);
  let index = start;
  while (index < line.length) {
    if (line[index] === "\\" && line[index + 1] === "|") {
      index += 2;
      continue;
    }
    if (line[index] === "|") break;
    index += 1;
  }
  // Trim the padding space before the closing pipe.
  let end = index;
  while (end > start && line[end - 1] === " ") end -= 1;
  return { from: start, to: Math.max(start, end) };
}

/**
 * Offset of a cell's text within its source line, for putting the cursor where
 * the user clicked. Returns the line length when the column runs past the row's
 * cells, which puts the cursor at the end rather than nowhere.
 */
export function cellOffsetInLine(line: string, columnIndex: number): number {
  const leading = line.length - line.trimStart().length;
  let column = 0;
  let index = leading;
  if (line[index] === "|") index += 1;

  while (index < line.length) {
    if (column === columnIndex) {
      // Skip the padding space the serializer writes after the pipe.
      while (index < line.length && line[index] === " ") index += 1;
      return index;
    }
    if (line[index] === "\\" && line[index + 1] === "|") {
      index += 2;
      continue;
    }
    if (line[index] === "|") {
      column += 1;
    }
    index += 1;
  }
  return line.length;
}

/**
 * Which source line holds a model row: the header is the region's first line,
 * and body row `n` sits after the delimiter row.
 */
export function sourceLineOfRow(rowIndex: number) {
  return rowIndex === 0 ? 0 : rowIndex + 1;
}
