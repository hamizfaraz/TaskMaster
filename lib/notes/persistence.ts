import { serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import { emptyNoteDocument, NoteDocumentSchema, type NoteDocument } from "@/lib/notes/types";

export type NormalizedNoteWriteContent = {
  document: NoteDocument;
  markdown: string;
};

export function normalizeNoteWriteContent(value: unknown = emptyNoteDocument): NormalizedNoteWriteContent {
  const document = NoteDocumentSchema.parse(value ?? emptyNoteDocument);

  return {
    document,
    markdown: serializeNoteDocumentToMarkdown(document),
  };
}
