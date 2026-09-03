import { normalizeTextMathToLatex } from "@/lib/math/latex";
import { parseMarkdownToNoteDocument, serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import { emptyNoteDocument, NoteDocumentSchema, type NoteDocument } from "@/lib/notes/types";

export type NormalizedNoteWriteContent = {
  document: NoteDocument;
  markdown: string;
};

/**
 * Legacy write path: the client sends a block document and markdown is
 * derived from it. Kept for callers that still speak blocks.
 */
export function normalizeNoteWriteContent(value: unknown = emptyNoteDocument): NormalizedNoteWriteContent {
  const document = normalizeNoteLatexRegions(
    NoteDocumentSchema.parse(value ?? emptyNoteDocument),
  );

  return {
    document,
    markdown: serializeNoteDocumentToMarkdown(document),
  };
}

/**
 * Canonical write path: the client sends Markdown (+ LaTeX) and it is stored
 * as-authored, apart from line-ending normalization and typed-math → LaTeX
 * normalization inside `$…$` / `$$…$$` regions (issue #58). The block
 * document is derived from it as a cache for consumers that still read blocks.
 */
export function normalizeNoteWriteMarkdown(value: unknown): NormalizedNoteWriteContent {
  if (typeof value !== "string") {
    throw new Error("Note markdown must be a string.");
  }

  const markdown = normalizeTextMathToLatex(value.replace(/\r\n?/g, "\n"));

  return {
    document: parseMarkdownToNoteDocument(markdown),
    markdown,
  };
}
