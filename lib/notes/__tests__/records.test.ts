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
