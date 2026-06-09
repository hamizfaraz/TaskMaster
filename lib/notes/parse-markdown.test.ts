import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";

describe("parseMarkdownToNoteDocument", () => {
  it("normalizes inline and block math to LaTeX", () => {
    const document = parseMarkdownToNoteDocument(
      ["Use $√(x²)$ here.", "", "$$", "πr² ≥ 0", "$$"].join("\n"),
    );

    expect(document.blocks).toMatchObject([
      {
        type: "paragraph",
        data: {
          text: "Use",
        },
      },
      {
        type: "math",
        data: {
          latex: "\\sqrt{x^2}",
        },
      },
      {
        type: "paragraph",
        data: {
          text: "here.",
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
