import { describe, expect, it } from "vitest";
import { normalizeNoteWriteContent } from "@/lib/notes/persistence";

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
