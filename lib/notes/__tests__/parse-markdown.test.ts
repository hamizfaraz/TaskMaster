import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";

describe("parseMarkdownToNoteDocument", () => {
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
