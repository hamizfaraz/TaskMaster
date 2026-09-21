import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";

const MAX_MARKDOWN_CHARS_PER_NOTE = 18_000;
const MAX_NOTES = 12;

export type MindMapContextNote = {
  id: string;
  title: string;
  markdown: string;
  embedding: number[];
};

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

/**
 * Loads the selected notes (scoped to the user) with their markdown + embedding so
 * the association generator can read them. Mirrors getQuizContextNotes.
 */
export async function getMindMapContextNotes(params: {
  userId: string;
  noteIds: string[];
}): Promise<MindMapContextNote[]> {
  const uniqueNoteIds = Array.from(new Set(params.noteIds)).slice(0, MAX_NOTES);
  if (uniqueNoteIds.length === 0) return [];

  const rows = await db
    .select({
      id: note.id,
      title: note.title,
      markdown: note.markdown,
      embedding: note.embedding,
    })
    .from(note)
    .where(and(eq(note.userId, params.userId), inArray(note.id, uniqueNoteIds)));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    markdown: row.markdown.trim().slice(0, MAX_MARKDOWN_CHARS_PER_NOTE),
    embedding: normalizeEmbedding(row.embedding),
  }));
}
