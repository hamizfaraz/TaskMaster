import { describe, expect, it } from "vitest";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import type { NoteDocument } from "@/lib/notes/types";

describe("normalizeNoteLatexRegions", () => {
  it("keeps single-dollar math inline inside paragraph blocks", () => {
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
          text: 'Use <span class="note-inline-math" data-latex="x^2 + y^2 = z^2">$x^2 + y^2 = z^2$</span> for the distance relation.',
        },
      },
    ]);
  });

  it("keeps imported inline math spans inline", () => {
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
          text: 'Area <span class="note-inline-math" data-latex="\\pi r^2">$\\pi r^2$</span>',
        },
      },
    ]);
  });

  it("splits display math into math blocks", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Before $$x^2 + y^2 = z^2$$ after",
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
          latex: "x^2 + y^2 = z^2",
        },
      },
      {
        type: "paragraph",
        data: {
          text: "after",
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
