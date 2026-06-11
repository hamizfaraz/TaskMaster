import { z } from "zod";
import type { FlashcardDeck, FlashcardItem } from "@/lib/flashcards/types";

export const flashcardItemSchema = z.object({
  id: z.string().trim().min(1),
  front: z.string().trim().min(1).max(2_000),
  back: z.string().trim().min(1).max(4_000),
  sourceNoteTitles: z.array(z.string().trim().min(1)).max(12).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
});

export const editableDeckSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceNoteIds: z.array(z.string().trim().min(1)).max(12).default([]),
  cards: z.array(flashcardItemSchema).min(1).max(80),
});

export type EditableFlashcardDeck = z.infer<typeof editableDeckSchema>;

export type FlashcardRow = {
  id: string;
  title: string;
  sourceNoteIds: string[];
  cards: unknown;
  cardCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeCards(value: unknown): FlashcardItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = flashcardItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function rowToFlashcardDeck(row: FlashcardRow): FlashcardDeck {
  const cards = normalizeCards(row.cards);

  return {
    id: row.id,
    title: row.title,
    sourceNoteIds: row.sourceNoteIds,
    cards,
    cardCount: cards.length || row.cardCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createDraftFlashcardDeck(params: {
  title: string;
  sourceNoteIds: string[];
  cards: FlashcardItem[];
}): FlashcardDeck {
  const now = new Date().toISOString();

  return {
    id: `draft-${crypto.randomUUID()}`,
    title: params.title,
    sourceNoteIds: params.sourceNoteIds,
    cards: params.cards,
    cardCount: params.cards.length,
    createdAt: now,
    updatedAt: now,
  };
}
