import { serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import { emptyNoteDocument, NoteDocumentSchema, type NoteDocument } from "@/lib/notes/types";

export type NormalizedNoteWriteContent = {
  document: NoteDocument;
  markdown: string;
};

export function normalizeNoteWriteContent(value: unknown = emptyNoteDocument): NormalizedNoteWriteContent {
  const document = normalizeNoteLatexRegions(
    NoteDocumentSchema.parse(value ?? emptyNoteDocument),
  );

  return {
    document,
    markdown: serializeNoteDocumentToMarkdown(document),
  };
}
