import { describe, expect, it } from "vitest";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import type { NoteDocument } from "@/lib/notes/types";

describe("normalizeNoteLatexRegions", () => {
  it("converts single-dollar math to inline math blocks", () => {
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
        type: "inlineMath",
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

  it("converts imported inline math spans to inline math blocks", () => {
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
        type: "inlineMath",
        data: {
          latex: "\\pi r^2",
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

  it("leaves prose alone even when it looks operator-heavy", () => {
    // Each of these was promoted to a display-math block by the old rule and
    // re-serialized as `$$…$$`, destroying the text.
    const prose = [
      "In C, a == b tests equality.",
      "Highlight: ==key idea==",
      "**b^2:** squared.",
      "\\* \\*\\*Author:\\*\\* A. N. Other",
      "*   **Proposition.** $\\mathbb{Q}$ is countable.",
      "where $E_n = O(h^2)$ as $h \\to 0$.",
      "- Solution in integers of $ax + by = c$.",
      "> A quote with $x$ in it.",
      "Use `a -> b` here.",
    ];

    for (const text of prose) {
      const document: NoteDocument = { time: 1, blocks: [{ type: "paragraph", data: { text } }] };
      // Inline `$…$` may still become an inlineMath block — that is this
      // function's job on the block path. What must never happen is the whole
      // line being swallowed into a display-math block.
      const types = normalizeNoteLatexRegions(document).blocks.map((block) => block.type);
      expect(types, `promoted to display math: ${text}`).not.toContain("math");
    }
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
