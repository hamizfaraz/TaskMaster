import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flashcards, note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { FlashcardsClient } from "@/app/flashcards/flashcards-client";
import { rowToFlashcardDeck } from "@/lib/flashcards/decks";

export default async function FlashcardsPage() {
  await connection();

  const session = await requireServerSession("/flashcards");
  const [noteRows, deckRows] = await Promise.all([
    db
      .select({
        id: note.id,
        title: note.title,
        embedding: note.embedding,
        updatedAt: note.updatedAt,
      })
      .from(note)
      .where(eq(note.userId, session.user.id))
      .orderBy(desc(note.updatedAt)),
    db
      .select({
        id: flashcards.id,
        title: flashcards.title,
        sourceNoteIds: flashcards.sourceNoteIds,
        cards: flashcards.cards,
        cardCount: flashcards.cardCount,
        createdAt: flashcards.createdAt,
        updatedAt: flashcards.updatedAt,
      })
      .from(flashcards)
      .where(eq(flashcards.userId, session.user.id))
      .orderBy(desc(flashcards.createdAt)),
  ]);

  const decks = deckRows.map(rowToFlashcardDeck);

  return (
    <FlashcardsClient
      notes={noteRows.map((row) => ({
        id: row.id,
        title: row.title,
        hasEmbedding: Array.isArray(row.embedding) && row.embedding.length > 0,
      }))}
      initialDecks={decks}
    />
  );
}
