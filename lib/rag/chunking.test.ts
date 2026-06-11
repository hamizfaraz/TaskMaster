import { describe, expect, it, vi } from "vitest";
import { chunkNoteDocument } from "@/lib/rag/chunking";
import type { NoteDocument, NoteListItem } from "@/lib/notes/types";

const countWords = (value: string) => value.match(/[A-Za-z0-9_]+/g)?.length ?? 0;

function paragraph(id: string, text: string): NoteDocument["blocks"][number] {
  return {
    id,
    type: "paragraph",
    data: {
      text,
    },
  };
}

function header(
  id: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
): NoteDocument["blocks"][number] {
  return {
    id,
    type: "header",
    data: {
      level,
      text,
    },
  };
}

function code(id: string, source: string): NoteDocument["blocks"][number] {
  return {
    id,
    type: "code",
    data: {
      code: source,
    },
  };
}

function nestedListItem(depth: number): NoteListItem {
  if (depth === 0) {
    return {
      content: "leaf detail",
      items: [],
    };
  }

  return {
    content: `depth ${depth}`,
    items: [nestedListItem(depth - 1)],
  };
}

describe("chunkNoteDocument", () => {
  it("creates semantic chunks from H1-H3 sections and carries heading context", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("h1", 1, "Biology"),
        paragraph("p1", "Cells regulate transport."),
        header("h2", 2, "Photosynthesis"),
        paragraph("p2", "Chloroplasts convert light energy."),
        header("h3", 3, "Light reactions"),
        paragraph("p3", "Photosystems split water."),
        header("h4", 4, "Tiny detail"),
        paragraph("p4", "H4 stays inside the active H3 chunk."),
      ],
    };

    const chunks = chunkNoteDocument(document, {
      maxTokens: 80,
      countTokens: countWords,
      noteId: "note-1",
    });

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.headingPath.map((heading) => heading.text))).toEqual([
      ["Biology"],
      ["Biology", "Photosynthesis"],
      ["Biology", "Photosynthesis", "Light reactions"],
    ]);
    expect(chunks.map((chunk) => chunk.sourceBlockIds)).toEqual([
      ["p1"],
      ["p2"],
      ["p3", "h4", "p4"],
    ]);
    expect(chunks[0]).toMatchObject({
      id: "note-1:chunk:0",
      content: "# Biology\n\nCells regulate transport.",
      tokenCount: 4,
      isOversized: false,
    });
    expect(chunks[2].content).toBe(
      [
        "# Biology",
        "## Photosynthesis",
        "### Light reactions",
        "",
        "Photosystems split water.",
        "",
        "#### Tiny detail",
        "",
        "H4 stays inside the active H3 chunk.",
      ].join("\n"),
    );
  });

  it("splits chunks within a section when adding another block would exceed the token limit", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("h1", 1, "RAG"),
        header("h2", 2, "Retrieval"),
        paragraph("p1", "semantic search ranks context"),
        paragraph("p2", "query embeddings guide generation"),
      ],
    };

    const chunks = chunkNoteDocument(document, {
      maxTokens: 6,
      countTokens: countWords,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "# RAG\n## Retrieval\n\nsemantic search ranks context",
      "# RAG\n## Retrieval\n\nquery embeddings guide generation",
    ]);
    expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([6, 6]);
    expect(chunks.every((chunk) => chunk.headingPath.map((heading) => heading.text).join(" > ") === "RAG > Retrieval")).toBe(
      true,
    );
  });

  it("serializes deeply nested lists in document order without dropping nested content", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("h1", 1, "Algorithms"),
        {
          id: "list-1",
          type: "list",
          data: {
            style: "unordered",
            items: [nestedListItem(8)],
          },
        },
      ],
    };

    const chunks = chunkNoteDocument(document, {
      maxTokens: 80,
      countTokens: countWords,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].sourceBlockIds).toEqual(["list-1"]);
    expect(chunks[0].content).toContain("- depth 8");
    expect(chunks[0].content).toContain("                                - leaf detail");
    expect(chunks[0].tokenCount).toBe(19);
  });

  it("skips empty headings, empty blocks, and blank list items without creating empty chunks", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("empty-heading", 1, "   "),
        paragraph("empty-paragraph", " <br> "),
        {
          id: "empty-list",
          type: "list",
          data: {
            style: "unordered",
            items: [
              {
                content: "   ",
                items: [],
              },
            ],
          },
        },
      ],
    };

    expect(
      chunkNoteDocument(document, {
        maxTokens: 20,
        countTokens: countWords,
      }),
    ).toEqual([]);
  });

  it("keeps an oversized code block intact and isolates following content into a new chunk", () => {
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("h1", 1, "Runtime"),
        code("code-1", "const alpha = 1;\nconst beta = 2;\nconst gamma = alpha + beta;"),
        paragraph("p1", "The code initializes values."),
      ],
    };

    const chunks = chunkNoteDocument(document, {
      maxTokens: 5,
      countTokens: countWords,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      sourceBlockIds: ["code-1"],
      isOversized: true,
      splitReason: "oversized-block",
    });
    expect(chunks[0].content).toBe(
      [
        "# Runtime",
        "",
        "```",
        "const alpha = 1;",
        "const beta = 2;",
        "const gamma = alpha + beta;",
        "```",
      ].join("\n"),
    );
    expect(chunks[1]).toMatchObject({
      sourceBlockIds: ["p1"],
      content: "# Runtime\n\nThe code initializes values.",
      isOversized: false,
    });
  });

  it("counts each non-empty heading or block once so token accounting stays linear", () => {
    const countTokens = vi.fn(countWords);
    const document: NoteDocument = {
      time: 1,
      blocks: [
        header("h1", 1, "Linear accounting"),
        paragraph("p1", "first block"),
        paragraph("p2", "second block"),
        paragraph("p3", "third block"),
      ],
    };

    chunkNoteDocument(document, {
      maxTokens: 6,
      countTokens,
    });

    expect(countTokens).toHaveBeenCalledTimes(4);
    expect(countTokens.mock.calls.map(([value]) => value)).toEqual([
      "Linear accounting",
      "first block",
      "second block",
      "third block",
    ]);
  });
});
