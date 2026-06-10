import { describe, expect, it } from "vitest";
import { serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import type { NoteDocument } from "@/lib/notes/types";

describe("serializeNoteDocumentToMarkdown", () => {
  it("serializes rich text paragraphs and headers into markdown", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "header",
          data: {
            level: 2,
            text: "Ship <em>notes</em>",
          },
        },
        {
          type: "paragraph",
          data: {
            text: 'Hello <strong>world</strong> and <a href="https://example.com">friends</a>.',
          },
        },
      ],
    };

    expect(serializeNoteDocumentToMarkdown(document)).toBe(
      "## Ship *notes*\n\nHello **world** and [friends](https://example.com).",
    );
  });

  it("serializes ordered lists, nested items, and checklists", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "list",
          data: {
            style: "ordered",
            meta: {
              start: 3,
            },
            items: [
              {
                content: "First",
                items: [],
              },
              {
                content: "Second",
                items: [
                  {
                    content: "Nested",
                    items: [],
                  },
                ],
              },
            ],
          },
        },
        {
          type: "list",
          data: {
            style: "checklist",
            items: [
              {
                content: "Done",
                meta: {
                  checked: true,
                },
                items: [],
              },
              {
                content: "Todo",
                meta: {
                  checked: false,
                },
                items: [],
              },
            ],
          },
        },
      ],
    };

    expect(serializeNoteDocumentToMarkdown(document)).toBe(
      "3. First\n4. Second\n    1. Nested\n\n- [x] Done\n- [ ] Todo",
    );
  });

  it("serializes quotes, code, images, and math blocks", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "quote",
          data: {
            text: "Keep <strong>going</strong>",
            caption: "Team",
          },
        },
        {
          type: "code",
          data: {
            code: 'console.log("hello");',
          },
        },
        {
          type: "image",
          data: {
            file: {
              url: "https://example.com/chart.png",
            },
            caption: "Chart <strong>one</strong>",
            withBorder: false,
            withBackground: false,
            stretched: false,
          },
        },
        {
          type: "math",
          data: {
            latex: "x^2 + y^2 = z^2",
          },
        },
      ],
    };

    expect(serializeNoteDocumentToMarkdown(document)).toBe(
      [
        "> Keep **going**",
        ">",
        "> Team",
        "",
        "```",
        'console.log("hello");',
        "```",
        "",
        "![Chart one](https://example.com/chart.png)",
        "",
        "Chart **one**",
        "",
        "$$",
        "x^2 + y^2 = z^2",
        "$$",
      ].join("\n"),
    );
  });

  it("serializes blocks in the current document order", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          id: "second",
          type: "paragraph",
          data: {
            text: "Second block moved first",
          },
        },
        {
          id: "first",
          type: "paragraph",
          data: {
            text: "First block moved second",
          },
        },
      ],
    };

    expect(serializeNoteDocumentToMarkdown(document)).toBe(
      "Second block moved first\n\nFirst block moved second",
    );
  });

  it("serializes inline math blocks with adjacent text as one inline sentence", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Use",
          },
        },
        {
          type: "inlineMath",
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
      ],
    };

    expect(serializeNoteDocumentToMarkdown(document)).toBe("Use $\\sqrt{x^2}$ here.");
  });
});
