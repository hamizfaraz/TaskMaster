import { describe, expect, it } from "vitest";
import {
  bodyRowCount,
  cellOffsetInLine,
  columnCount,
  cycleAlignment,
  deleteColumn,
  deleteRow,
  findTableRanges,
  insertColumn,
  insertRow,
  parseTableModel,
  serializeTableModel,
  sourceLineOfRow,
} from "@/lib/notes/table-edit";

const table = [
  "| Symbol | Meaning | Note |",
  "| --- | :-: | --: |",
  "| $\\pi$ | circle ratio | a \\| b |",
  "| $e$ | Euler |  |",
].join("\n");

function model() {
  const parsed = parseTableModel(table);
  if (!parsed) throw new Error("fixture is not a table");
  return parsed;
}

describe("parseTableModel", () => {
  it("reads the header, body and alignment", () => {
    const m = model();
    expect(m.rows[0]).toEqual(["Symbol", "Meaning", "Note"]);
    expect(m.rows[2]).toEqual(["$e$", "Euler", ""]);
    expect(m.align).toEqual([null, "center", "right"]);
    expect(columnCount(m)).toBe(3);
    expect(bodyRowCount(m)).toBe(2);
  });

  it("keeps an escaped pipe as content, not a cell boundary", () => {
    expect(model().rows[1]).toEqual(["$\\pi$", "circle ratio", "a | b"]);
  });

  it("returns null for text that is not a table", () => {
    expect(parseTableModel("just a paragraph")).toBeNull();
    expect(parseTableModel("| no delimiter row |")).toBeNull();
  });

  it("squares up a ragged table", () => {
    const ragged = ["| a | b | c |", "| --- | --- | --- |", "| 1 |"].join("\n");
    expect(parseTableModel(ragged)?.rows[1]).toEqual(["1", "", ""]);
  });
});

describe("serializeTableModel", () => {
  it("round-trips the generator's shape byte-for-byte", () => {
    expect(serializeTableModel(model())).toBe(table);
  });

  it("re-escapes a pipe that lives inside a cell", () => {
    expect(serializeTableModel(model())).toContain("a \\| b");
  });
});

describe("row edits", () => {
  it("inserts a blank row at a position", () => {
    const next = insertRow(model(), 1);
    expect(bodyRowCount(next)).toBe(3);
    expect(next.rows[1]).toEqual(["", "", ""]);
    expect(next.rows[2]).toEqual(["$\\pi$", "circle ratio", "a | b"]);
  });

  it("never lets an insert displace the header", () => {
    // A GFM table with no header row cannot be serialized, so index 0 clamps.
    const next = insertRow(model(), 0);
    expect(next.rows[0]).toEqual(["Symbol", "Meaning", "Note"]);
  });

  it("deletes a body row", () => {
    const next = deleteRow(model(), 1);
    expect(bodyRowCount(next)).toBe(1);
    expect(next.rows[1]).toEqual(["$e$", "Euler", ""]);
  });

  it("refuses to delete the header", () => {
    expect(deleteRow(model(), 0)).toEqual(model());
  });

  it("allows a header-only table and still serializes it", () => {
    let m = deleteRow(model(), 1);
    m = deleteRow(m, 1);
    expect(bodyRowCount(m)).toBe(0);
    expect(serializeTableModel(m)).toBe("| Symbol | Meaning | Note |\n| --- | :-: | --: |");
  });
});

describe("column edits", () => {
  it("inserts a column and widens every row including alignment", () => {
    const next = insertColumn(model(), 1);
    expect(columnCount(next)).toBe(4);
    expect(next.rows[0]).toEqual(["Symbol", "", "Meaning", "Note"]);
    expect(next.align).toEqual([null, null, "center", "right"]);
  });

  it("deletes a column and its alignment together", () => {
    const next = deleteColumn(model(), 1);
    expect(next.rows[0]).toEqual(["Symbol", "Note"]);
    expect(next.align).toEqual([null, "right"]);
  });

  it("refuses to delete the last column", () => {
    let m = deleteColumn(model(), 0);
    m = deleteColumn(m, 0);
    expect(columnCount(m)).toBe(1);
    expect(deleteColumn(m, 0)).toEqual(m);
  });

  it("cycles alignment through the four states and back", () => {
    let m = model();
    expect(m.align[0]).toBeNull();
    m = cycleAlignment(m, 0);
    expect(m.align[0]).toBe("left");
    m = cycleAlignment(m, 0);
    expect(m.align[0]).toBe("center");
    m = cycleAlignment(m, 0);
    expect(m.align[0]).toBe("right");
    m = cycleAlignment(m, 0);
    expect(m.align[0]).toBeNull();
  });
});

describe("findTableRanges", () => {
  it("finds a table and stops at its last row", () => {
    const doc = `Intro\n\n${table}\n\nAfter`;
    const [range, ...rest] = findTableRanges(doc);
    expect(rest).toHaveLength(0);
    expect(doc.slice(range!.from, range!.to)).toBe(table);
  });

  it("ignores a table inside a fenced code block", () => {
    // A markdown example in a fence is text to read, not a table to edit.
    const doc = ["```markdown", "| a | b |", "| --- | --- |", "| 1 | 2 |", "```"].join("\n");
    expect(findTableRanges(doc)).toEqual([]);
  });

  it("still finds a table whose cells contain inline code", () => {
    // findCodeRanges reports inline spans too, so testing for overlap rather
    // than containment dropped any table with a `code` cell.
    const doc = ["Intro.", "", "| Term | Detail |", "| --- | --- |", "| `a` | `b` |"].join("\n");
    expect(findTableRanges(doc)).toHaveLength(1);
  });

  it("finds two separate tables", () => {
    expect(findTableRanges(`${table}\n\n${table}`)).toHaveLength(2);
  });

  it("requires a delimiter row", () => {
    expect(findTableRanges("| a | b |\n| 1 | 2 |")).toEqual([]);
  });
});

describe("clicking a cell maps back to its source", () => {
  it("finds the offset of each cell in a row", () => {
    const line = "| Symbol | Meaning | Note |";
    expect(line.slice(cellOffsetInLine(line, 0))).toBe("Symbol | Meaning | Note |");
    expect(line.slice(cellOffsetInLine(line, 1))).toBe("Meaning | Note |");
    expect(line.slice(cellOffsetInLine(line, 2))).toBe("Note |");
  });

  it("does not treat an escaped pipe as a boundary", () => {
    const line = "| a \\| b | second |";
    expect(line.slice(cellOffsetInLine(line, 1))).toBe("second |");
  });

  it("maps model rows past the delimiter row", () => {
    expect(sourceLineOfRow(0)).toBe(0);
    expect(sourceLineOfRow(1)).toBe(2);
    expect(sourceLineOfRow(2)).toBe(3);
  });
});
