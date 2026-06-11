import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import type { FlashcardContextNote } from "@/lib/flashcards/types";

const MAX_MARKDOWN_CHARS_PER_NOTE = 18_000;

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

export async function getFlashcardContextNotes(params: {
  userId: string;
  noteIds: string[];
}): Promise<FlashcardContextNote[]> {
  const uniqueNoteIds = Array.from(new Set(params.noteIds)).slice(0, 12);
  if (uniqueNoteIds.length === 0) {
    return [];
  }

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
