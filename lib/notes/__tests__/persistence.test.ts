import { describe, expect, it } from "vitest";
import { normalizeNoteWriteContent, normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";

describe("normalizeNoteWriteMarkdown", () => {
  it("stores markdown as authored and derives the block cache from it", () => {
    const markdown = [
      "## Primes",
      "",
      "The area is $A = \\pi r^2$.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");

    const content = normalizeNoteWriteMarkdown(markdown);

    expect(content.markdown).toBe(markdown);
    expect(content.document.blocks.map((block) => block.type)).toEqual([
      "header",
      "paragraph",
      "inlineMath",
      "paragraph",
      "table",
    ]);
  });

  it("normalizes typed math to LaTeX and CRLF to LF, and is idempotent", () => {
    const once = normalizeNoteWriteMarkdown("Use $√(x²)$ here.\r\n\r\n$$\r\nα ≤ β\r\n$$");

    expect(once.markdown).toBe("Use $\\sqrt{x^2}$ here.\n\n$$\n\\alpha \\le \\beta\n$$");
    expect(normalizeNoteWriteMarkdown(once.markdown).markdown).toBe(once.markdown);
  });

  it("rejects non-string markdown", () => {
    expect(() => normalizeNoteWriteMarkdown({ blocks: [] })).toThrow();
  });
});

describe("normalizeNoteWriteContent", () => {
  it("validates note JSON and derives markdown from block content", () => {
    const content = normalizeNoteWriteContent({
      time: 1,
      blocks: [
        {
          id: "heading",
          type: "header",
          data: {
            level: 2,
            text: "Server saved",
          },
        },
        {
          id: "body",
          type: "paragraph",
          data: {
            text: "Markdown is derived on write",
          },
        },
      ],
    });

    expect(content.markdown).toBe("## Server saved\n\nMarkdown is derived on write");
    expect(content.document.blocks).toHaveLength(2);
  });

  it("rejects invalid note JSON before persistence", () => {
    expect(() =>
      normalizeNoteWriteContent({
        time: 1,
        blocks: [
          {
            type: "unsupported",
            data: {},
          },
        ],
      }),
    ).toThrow();
  });
});
