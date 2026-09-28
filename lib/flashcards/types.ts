import type { NoteContext } from "@/lib/notes/context";
export type FlashcardItem = {
  id: string;
  front: string;
  back: string;
  sourceNoteTitles: string[];
  tags?: string[];
};

export type FlashcardDeck = {
  id: string;
  title: string;
  sourceNoteIds: string[];
  cards: FlashcardItem[];
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Use `NoteContext` from `@/lib/notes/context`. */
export type FlashcardContextNote = NoteContext;
