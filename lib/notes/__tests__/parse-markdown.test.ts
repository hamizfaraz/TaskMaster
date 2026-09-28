import { describe, expect, it } from "vitest";
import {
  parseMarkdownToNoteDocument,
  renderInlineMarkdownText,
} from "@/lib/notes/parse-markdown";

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

  it("maps Mermaid fences to Mermaid note blocks", () => {
    const document = parseMarkdownToNoteDocument(
      [
        "## Flow",
        "",
        "```mermaid",
        "graph TD",
        "  A[Start] --> B{Ready?}",
        "  B --> C[Ship]",
        "```",
      ].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        type: "header",
        data: {
          level: 2,
          text: "Flow",
        },
      },
      {
        type: "mermaid",
        data: {
          code: "graph TD\n  A[Start] --> B{Ready?}\n  B --> C[Ship]",
        },
      },
    ]);
  });

  it("keeps non-Mermaid fences as code blocks", () => {
    const document = parseMarkdownToNoteDocument(
      ["```java", "System.out.println(\"hi\");", "```"].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        type: "code",
        data: {
          language: "java",
          code: 'System.out.println("hi");',
        },
      },
    ]);
  });

  it("renders inline markdown markers in note text blocks", () => {
    const document = parseMarkdownToNoteDocument(
      [
        "## **Architecture** notes",
        "",
        "- **Logical view:** Shows object classes.",
        "- *Process view:* Shows runtime processes.",
        "- `Module` view uses [UML](https://example.com).",
        "",
        "> ~~Deprecated~~ view",
      ].join("\n"),
    );

    expect(document.blocks).toEqual([
      {
        type: "header",
        data: {
          level: 2,
          text: "<strong>Architecture</strong> notes",
        },
      },
      {
        type: "list",
        data: {
          style: "unordered",
          items: [
            {
              content: "<strong>Logical view:</strong> Shows object classes.",
              meta: {},
              items: [],
            },
            {
              content: "<em>Process view:</em> Shows runtime processes.",
              meta: {},
              items: [],
            },
            {
              content:
                '<code>Module</code> view uses <a href="https://example.com">UML</a>.',
              meta: {},
              items: [],
            },
          ],
        },
      },
      {
        type: "quote",
        data: {
          text: "<s>Deprecated</s> view",
          caption: "",
          alignment: "left",
        },
      },
    ]);
  });
});

describe("nested inline tokens", () => {
  // Regression: the renderer stashes backslash escapes, code spans and math
  // spans behind placeholders, and a math span can contain an escape that was
  // stashed first. Restoring in ascending index order expanded the escape
  // before the span that held it, so the inner placeholder was never restored.
  // It reached Postgres as a NUL and failed the insert with 22P05 — and had it
  // been stripped instead, `T\_1` would have been stored as `T01`.
  const nested = [
    "$y[n] = T\\_1$",
    "inline $a \\_ b$ math",
    "$x \\* y$",
    "code `a` then $T\\_1$",
    "$y[n] = T\\{1\\}$",
  ];

  it("leaves no placeholder delimiter in the output", () => {
    for (const line of nested) {
      const html = renderInlineMarkdownText(line);
      expect(html, line).not.toMatch(/[\u0000\uE000-\uE00F]/);
    }
  });

  it("restores the escape inside the math span instead of losing it", () => {
    const html = renderInlineMarkdownText("$y[n] = T\\_1$");
    expect(html).toContain('data-latex="y[n] = T\\_1"');
    expect(html).toContain("$y[n] = T\\_1$");
  });

  it("restores several escapes nested in one span", () => {
    const html = renderInlineMarkdownText("$y[n] = T\\{1\\}$");
    expect(html).toContain('data-latex="y[n] = T\\{1\\}"');
  });

  it("keeps a code span and a math span independent", () => {
    const html = renderInlineMarkdownText("code `a` then $T\\_1$");
    expect(html).toContain("<code>a</code>");
    expect(html).toContain('data-latex="T\\_1"');
  });
});
