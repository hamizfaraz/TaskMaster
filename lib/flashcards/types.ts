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

export type FlashcardContextNote = {
  id: string;
  title: string;
  markdown: string;
  embedding: number[];
};
