import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument, serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";

const table = [
  "| Symbol | Meaning | Note |",
  "| --- | :-: | --: |",
  "| $\\pi$ | circle ratio | a \\| b |",
  "| $e$ | Euler |  |",
].join("\n");

describe("GFM table blocks", () => {
  it("parses a header row, delimiter row, and body rows into one table block", () => {
    const document = parseMarkdownToNoteDocument(table);

    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      type: "table",
      data: {
        rows: [
          ["Symbol", "Meaning", "Note"],
          ["$\\pi$", "circle ratio", "a | b"],
          ["$e$", "Euler", ""],
        ],
        align: [null, "center", "right"],
      },
    });
  });

  it("round-trips the generator's table shape unchanged", () => {
    expect(serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(table))).toBe(table);
  });

  it("does not swallow a table into a preceding paragraph", () => {
    const markdown = ["Intro line", "| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const types = parseMarkdownToNoteDocument(markdown).blocks.map((block) => block.type);

    expect(types).toEqual(["paragraph", "table"]);
  });

  it("stops the table at a blank line or a non-table line", () => {
    const markdown = ["| a | b |", "| --- | --- |", "| 1 | 2 |", "", "After"].join("\n");
    const types = parseMarkdownToNoteDocument(markdown).blocks.map((block) => block.type);

    expect(types).toEqual(["table", "paragraph"]);
  });

  it("treats a lone pipe line without a delimiter row as ordinary text", () => {
    const document = parseMarkdownToNoteDocument("x | y");

    expect(document.blocks.map((block) => block.type)).toEqual(["paragraph"]);
  });

  it("pads ragged rows to the header width", () => {
    const document = parseMarkdownToNoteDocument(["| a | b | c |", "| --- | --- | --- |", "| 1 |"].join("\n"));

    expect(document.blocks[0]).toMatchObject({
      type: "table",
      data: { rows: [["a", "b", "c"], ["1", "", ""]] },
    });
  });
});
