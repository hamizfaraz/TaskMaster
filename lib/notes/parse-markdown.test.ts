import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";

describe("parseMarkdownToNoteDocument", () => {
  it("keeps inline math inline and normalizes block math", () => {
    const document = parseMarkdownToNoteDocument(
      ["Use $√(x²)$ here.", "", "$$", "πr² ≥ 0", "$$"].join("\n"),
    );

    // Inline math stays *inside* the paragraph's rich text. Splitting the
    // paragraph at math boundaries is what used to flatten that rich text and
    // destroy every bold on the line.
    //
    // The span keeps the text as authored; typed-math normalization happens on
    // the markdown itself in `normalizeNoteWriteMarkdown` before this parser
    // runs (see persistence.test.ts), so the cache agrees with the column.
    expect(document.blocks).toMatchObject([
      {
        type: "paragraph",
        data: {
          text: 'Use <span class="note-inline-math" data-latex="√(x²)">$√(x²)$</span> here.',
        },
      },
      {
        type: "math",
        data: {
          latex: "\\pi r^2 \\ge 0",
        },
      },
    ]);
  });
});
