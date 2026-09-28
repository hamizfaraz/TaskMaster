import { connection } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { flashcards, note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";
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
        classId: note.classId,
        embedding: note.embedding,
        updatedAt: note.updatedAt,
      })
      .from(note)
      .where(and(eq(note.userId, session.user.id), isNull(note.deletedAt)))
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

  // Every note belongs to a class now, so the picker can say which one
  // instead of showing a flat list that spans courses.
  const classLabels = new Map(
    (await listUserClasses(session.user.id)).map((item) => [
      item.courseId,
      item.courseCode ? `${item.courseCode}` : item.title,
    ]),
  );

  return (
    <FlashcardsClient
      notes={noteRows.map((row) => ({
        id: row.id,
        title: row.title,
        className: classLabels.get(row.classId ?? "") ?? null,
        hasEmbedding: Array.isArray(row.embedding) && row.embedding.length > 0,
      }))}
      initialDecks={decks}
    />
  );
}
