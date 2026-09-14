import { describe, expect, it } from "vitest";
import { noteRecordToWorkspaceNote } from "@/lib/notes/records";

describe("noteRecordToWorkspaceNote", () => {
  const baseRecord = {
    id: "note-1",
    title: "Architecture",
    classId: null,
    fileName: "lecture.pdf",
    mimeType: "application/pdf",
    fileSize: 100,
    embedding: null,
    createdAt: new Date("2026-06-08T00:00:00.000Z"),
    updatedAt: new Date("2026-06-08T00:00:00.000Z"),
  };

  it("renders inline markdown markers from older generated note blocks", () => {
    const note = noteRecordToWorkspaceNote({
      ...baseRecord,
      sourceType: "upload",
      content: {
        time: 1,
        blocks: [
          {
            type: "header",
            data: {
              level: 2,
              text: "**Views** described",
            },
          },
          {
            type: "list",
            data: {
              style: "unordered",
              items: [
                {
                  content: "**Logical view:** Shows abstractions.",
                  meta: {},
                  items: [],
                },
              ],
            },
          },
        ],
      },
    });

    expect(note.content.document.blocks[0]).toMatchObject({
      type: "header",
      data: {
        text: "<strong>Views</strong> described",
      },
    });
    expect(note.content.document.blocks[1]).toMatchObject({
      type: "list",
      data: {
        items: [
          {
            content: "<strong>Logical view:</strong> Shows abstractions.",
          },
        ],
      },
    });
    expect(note.content.markdown).toContain("## **Views** described");
    expect(note.content.markdown).toContain("- **Logical view:** Shows abstractions.");
  });

  it("prefers the markdown column, but falls back to the block cache when it is empty", () => {
    const blocks = [{ type: "paragraph" as const, data: { text: "From blocks" } }];

    const stored = noteRecordToWorkspaceNote({
      ...baseRecord,
      sourceType: "manual",
      markdown: "# Column wins",
      content: { time: 1, blocks },
    });
    expect(stored.content.markdown).toBe("# Column wins");

    const legacy = noteRecordToWorkspaceNote({
      ...baseRecord,
      sourceType: "manual",
      markdown: "",
      content: { time: 1, blocks },
    });
    expect(legacy.content.markdown).toBe("From blocks");

    const empty = noteRecordToWorkspaceNote({
      ...baseRecord,
      sourceType: "manual",
      markdown: "",
      content: { time: 1, blocks: [] },
    });
    expect(empty.content.markdown).toBe("");
  });

  it("leaves manual notes with literal markdown markers alone", () => {
    const note = noteRecordToWorkspaceNote({
      ...baseRecord,
      sourceType: "manual",
      content: {
        time: 1,
        blocks: [
          {
            type: "paragraph",
            data: {
              text: "Keep **literal markers** here.",
            },
          },
        ],
      },
    });

    expect(note.content.document.blocks[0]).toMatchObject({
      type: "paragraph",
      data: {
        text: "Keep **literal markers** here.",
      },
    });
  });
});
