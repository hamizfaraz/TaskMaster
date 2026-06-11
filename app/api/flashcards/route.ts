import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { flashcards } from "@/lib/db/schema";
import { createDraftFlashcardDeck, editableDeckSchema, rowToFlashcardDeck } from "@/lib/flashcards/decks";
import { getFlashcardContextNotes } from "@/lib/flashcards/context";
import { generateFlashcardDeck } from "@/lib/flashcards/gemini";

export const runtime = "nodejs";

const legacyCreateFlashcardsSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(12),
  cardCount: z.number().int().min(4).max(40),
});

const generatePreviewSchema = legacyCreateFlashcardsSchema.extend({
  mode: z.literal("generate"),
});

const saveDeckSchema = editableDeckSchema.extend({
  mode: z.literal("save"),
});

const updateDeckSchema = editableDeckSchema.extend({
  deckId: z.string().trim().min(1),
});

async function requireSession() {
  return auth.api.getSession({ headers: await headers() });
}

async function generateDeckPreview(params: { userId: string; noteIds: string[]; cardCount: number }) {
  const uniqueNoteIds = Array.from(new Set(params.noteIds));
  const contextNotes = await getFlashcardContextNotes({
    userId: params.userId,
    noteIds: uniqueNoteIds,
  });

  if (contextNotes.length !== uniqueNoteIds.length) {
    return { error: "One or more selected notes could not be found", status: 404 } as const;
  }

  if (contextNotes.every((note) => note.embedding.length === 0)) {
    return { error: "Selected notes do not have stored embeddings yet", status: 400 } as const;
  }

  const generatedDeck = await generateFlashcardDeck({
    notes: contextNotes,
    cardCount: params.cardCount,
  });

  return {
    deck: createDraftFlashcardDeck({
      title: generatedDeck.title,
      sourceNoteIds: uniqueNoteIds,
      cards: generatedDeck.cards,
    }),
  } as const;
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
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
    .orderBy(desc(flashcards.createdAt));

  return NextResponse.json({ decks: rows.map(rowToFlashcardDeck) });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const generateParsed = generatePreviewSchema.safeParse(body);
  const saveParsed = saveDeckSchema.safeParse(body);
  const legacyParsed = legacyCreateFlashcardsSchema.safeParse(body);

  try {
    if (generateParsed.success) {
      const result = await generateDeckPreview({
        userId: session.user.id,
        noteIds: generateParsed.data.noteIds,
        cardCount: generateParsed.data.cardCount,
      });

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ deck: result.deck, saved: false });
    }

    if (saveParsed.success) {
      const [created] = await db
        .insert(flashcards)
        .values({
          userId: session.user.id,
          title: saveParsed.data.title,
          sourceNoteIds: saveParsed.data.sourceNoteIds,
          cards: saveParsed.data.cards,
          cardCount: saveParsed.data.cards.length,
        })
        .returning();

      return NextResponse.json({ deck: rowToFlashcardDeck(created) }, { status: 201 });
    }

    if (!legacyParsed.success) {
      return NextResponse.json({ error: "Invalid flashcard request" }, { status: 400 });
    }

    const result = await generateDeckPreview({
      userId: session.user.id,
      noteIds: legacyParsed.data.noteIds,
      cardCount: legacyParsed.data.cardCount,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const [created] = await db
      .insert(flashcards)
      .values({
        userId: session.user.id,
        title: result.deck.title,
        sourceNoteIds: result.deck.sourceNoteIds,
        cards: result.deck.cards,
        cardCount: result.deck.cards.length,
      })
      .returning();

    return NextResponse.json({ deck: rowToFlashcardDeck(created) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/flashcards]", error);
    return NextResponse.json({ error: "Flashcard generation failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid flashcard deck" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(flashcards)
      .set({
        title: parsed.data.title,
        sourceNoteIds: parsed.data.sourceNoteIds,
        cards: parsed.data.cards,
        cardCount: parsed.data.cards.length,
        updatedAt: new Date(),
      })
      .where(and(eq(flashcards.id, parsed.data.deckId), eq(flashcards.userId, session.user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Flashcard deck not found" }, { status: 404 });
    }

    return NextResponse.json({ deck: rowToFlashcardDeck(updated) });
  } catch (error) {
    console.error("[PATCH /api/flashcards]", error);
    return NextResponse.json({ error: "Failed to save flashcard deck" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckId = new URL(req.url).searchParams.get("deckId");
  const parsedDeckId = z.string().trim().min(1).safeParse(deckId);
  if (!parsedDeckId.success) {
    return NextResponse.json({ error: "Missing flashcard deck id" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(flashcards)
    .where(and(eq(flashcards.id, parsedDeckId.data), eq(flashcards.userId, session.user.id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Flashcard deck not found" }, { status: 404 });
  }

  return NextResponse.json({ deletedDeckId: deleted.id });
}
