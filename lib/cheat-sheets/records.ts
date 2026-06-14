import { createNoteContent } from "@/lib/notes/markdown";
import { normalizeNoteDocument } from "@/lib/notes/records";
import type { NoteContent } from "@/lib/notes/types";

/** Raw DB row shape returned from the cheat_sheet table / API. */
export type CheatSheetRecord = {
  id: string;
  title: string;
  classId: string | null;
  content: unknown;
  markdown?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

/** Client-side shape used by the cheat-sheet workspace. */
export type CheatSheet = {
  id: string;
  title: string;
  classId: string | null;
  content: NoteContent;
  createdAt: string;
  updatedAt: string;
};

function normalizeDate(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function rowToCheatSheet(record: CheatSheetRecord): CheatSheet {
  const document = normalizeNoteDocument(record.content);
  const content = createNoteContent(document);
  const markdown =
    typeof record.markdown === "string" ? record.markdown : content.markdown;

  return {
    id: record.id,
    title: record.title,
    classId: record.classId,
    createdAt: normalizeDate(record.createdAt),
    updatedAt: normalizeDate(record.updatedAt),
    content: {
      markdown,
      document,
    },
  };
}

export function sortCheatSheets(sheets: CheatSheet[]) {
  return [...sheets].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}
