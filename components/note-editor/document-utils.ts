import type { NoteDocument } from "@/lib/notes/types";

export function areDocumentsEqual(left: NoteDocument, right: NoteDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}
