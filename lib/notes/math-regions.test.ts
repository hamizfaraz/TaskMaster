import { describe, expect, it } from "vitest";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import type { NoteDocument } from "@/lib/notes/types";

describe("normalizeNoteLatexRegions", () => {
  it("splits delimited inline math into math blocks", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Use $x^2 + y^2 = z^2$ for the distance relation.",
          },
        },
      ],
    };

    expect(normalizeNoteLatexRegions(document).blocks).toEqual([
      {
        type: "paragraph",
        data: {
          text: "Use",
        },
      },
      {
        type: "math",
        data: {
          latex: "x^2 + y^2 = z^2",
        },
      },
      {
        type: "paragraph",
        data: {
          text: "for the distance relation.",
        },
      },
    ]);
  });

  it("converts imported inline math spans to math blocks", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: 'Area <span class="note-inline-math" data-latex="\\pi r^2">$\\pi r^2$</span>',
          },
        },
      ],
    };

    expect(normalizeNoteLatexRegions(document).blocks).toEqual([
      {
        type: "paragraph",
        data: {
          text: "Area",
        },
      },
      {
        type: "math",
        data: {
          latex: "\\pi r^2",
        },
      },
    ]);
  });

  it("converts standalone raw LaTeX lines", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Before<br>x^2 + y_2 = 4<br>After",
          },
        },
      ],
    };

    expect(normalizeNoteLatexRegions(document).blocks).toEqual([
      {
        type: "paragraph",
        data: {
          text: "Before",
        },
      },
      {
        type: "math",
        data: {
          latex: "x^2 + y_2 = 4",
        },
      },
      {
        type: "paragraph",
        data: {
          text: "After",
        },
      },
    ]);
  });
});
