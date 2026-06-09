import { createNoteContent } from "@/lib/notes/markdown";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";
import { emptyNoteDocument, NoteDocumentSchema, type NoteContent, type NoteDocument } from "@/lib/notes/types";

export type NoteSourceType = "manual" | "upload";

export type NoteRecord = {
  id: string;
  title: string;
  classId: string | null;
  content: unknown;
  markdown?: string | null;
  sourceType: NoteSourceType;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  embedding?: number[] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type NoteGenerationMetadata = {
  fileName: string;
  sourceTitle: string;
  topicTitle: string;
  topicIndex: number;
  topicCount: number;
  markdown: string;
  embedding: number[];
  embeddingDimensions: number;
  embeddingModel?: string;
};

export type WorkspaceNote = {
  id: string;
  title: string;
  classId: string | null;
  sourceType: NoteSourceType;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  embedding: number[] | null;
  createdAt: string;
  updatedAt: string;
  content: NoteContent;
  generation: NoteGenerationMetadata | null;
};

function createEmptyDocument(): NoteDocument {
  return {
    ...emptyNoteDocument,
    blocks: [],
  };
}

function normalizeDate(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function normalizeNoteDocument(value: unknown): NoteDocument {
  if (!value) {
    return createEmptyDocument();
  }

  const parsed = NoteDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return createEmptyDocument();
  }

  return normalizeNoteLatexRegions(parsed.data);
}

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is number => typeof item === "number");
}

function normalizeNoteGeneration(value: unknown, noteEmbedding: number[] | null): NoteGenerationMetadata | null {
  if (!value || typeof value !== "object" || !("noteGeneration" in value)) {
    return null;
  }

  const metadata = (value as { noteGeneration?: unknown }).noteGeneration;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = metadata as Partial<NoteGenerationMetadata>;
  if (
    typeof candidate.fileName !== "string" ||
    typeof candidate.sourceTitle !== "string" ||
    typeof candidate.topicTitle !== "string" ||
    typeof candidate.topicIndex !== "number" ||
    typeof candidate.topicCount !== "number" ||
    typeof candidate.markdown !== "string" ||
    !Array.isArray(candidate.embedding)
  ) {
    return null;
  }

  const embedding = noteEmbedding ?? normalizeEmbedding(candidate.embedding) ?? [];

  return {
    fileName: candidate.fileName,
    sourceTitle: candidate.sourceTitle,
    topicTitle: candidate.topicTitle,
    topicIndex: candidate.topicIndex,
    topicCount: candidate.topicCount,
    markdown: candidate.markdown,
    embedding,
    embeddingDimensions:
      typeof candidate.embeddingDimensions === "number"
        ? candidate.embeddingDimensions
        : embedding.length,
    embeddingModel:
      typeof candidate.embeddingModel === "string" ? candidate.embeddingModel : undefined,
  };
}

export function noteRecordToWorkspaceNote(record: NoteRecord): WorkspaceNote {
  const document = normalizeNoteDocument(record.content);
  const embedding = normalizeEmbedding(record.embedding);
  const content = createNoteContent(document);
  const markdown = typeof record.markdown === "string" ? record.markdown : content.markdown;

  return {
    id: record.id,
    title: record.title,
    classId: record.classId,
    sourceType: record.sourceType,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    embedding,
    createdAt: normalizeDate(record.createdAt),
    updatedAt: normalizeDate(record.updatedAt),
    content: {
      markdown,
      document,
    },
    generation: normalizeNoteGeneration(record.content, embedding),
  };
}

export function sortWorkspaceNotes(notes: WorkspaceNote[]) {
  return [...notes].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}
