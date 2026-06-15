import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, spacedRepEntry } from "@/lib/db/schema";
import { listUserEntries } from "@/lib/spaced-repetition/queries";
import { initialSchedule } from "@/lib/spaced-repetition/scheduling";
import type { SpacedRepEntryRecord } from "@/lib/spaced-repetition/records";
import {
  hasSpacedRepetitionStorage,
  spacedRepetitionStorageUnavailableMessage,
} from "@/lib/spaced-repetition/storage";

export const runtime = "nodejs";

// GET /api/spaced-repetition - list the authenticated user's enrolled notes
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasSpacedRepetitionStorage())) {
    return NextResponse.json(
      { error: spacedRepetitionStorageUnavailableMessage },
      { status: 503 },
    );
  }

  try {
    const entries = await listUserEntries(session.user.id);
    return NextResponse.json(entries);
  } catch (error) {
    console.error("[GET /api/spaced-repetition]", error);
    return NextResponse.json(
      { error: "Could not load review schedule" },
      { status: 500 },
    );
  }
}

// POST /api/spaced-repetition - enroll one or more existing notes
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasSpacedRepetitionStorage())) {
    return NextResponse.json(
      { error: spacedRepetitionStorageUnavailableMessage },
      { status: 503 },
    );
  }

  let body: { noteIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const noteIds = Array.isArray(body.noteIds)
    ? Array.from(
        new Set(
          body.noteIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ),
      )
    : [];

  if (noteIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one note to enroll" },
      { status: 400 },
    );
  }

  try {
    // Only notes the user actually owns can be enrolled.
    const ownedNotes = await db
      .select({
        id: note.id,
        title: note.title,
        markdown: note.markdown,
        hasEmbedding: sql<boolean>`${note.embedding} is not null`,
      })
      .from(note)
      .where(and(eq(note.userId, session.user.id), inArray(note.id, noteIds)));

    if (ownedNotes.length === 0) {
      return NextResponse.json(
        { error: "No valid notes to enroll" },
        { status: 400 },
      );
    }

    const { stage, nextReviewAt } = initialSchedule();
    const inserted = await db
      .insert(spacedRepEntry)
      .values(
        ownedNotes.map((owned) => ({
          userId: session.user.id,
          noteId: owned.id,
          stage,
          nextReviewAt,
        })),
      )
      .onConflictDoNothing({
        target: [spacedRepEntry.userId, spacedRepEntry.noteId],
      })
      .returning();

    const noteById = new Map(ownedNotes.map((owned) => [owned.id, owned]));
    const created: SpacedRepEntryRecord[] = inserted.map((entry) => {
      const owned = noteById.get(entry.noteId);
      return {
        id: entry.id,
        noteId: entry.noteId,
        noteTitle: owned?.title ?? "Untitled",
        markdown: owned?.markdown ?? "",
        stage: entry.stage,
        nextReviewAt: entry.nextReviewAt,
        lastReviewedAt: entry.lastReviewedAt,
        reviewCount: entry.reviewCount,
        totalStudySeconds: entry.totalStudySeconds,
        lastRating: entry.lastRating,
        hasEmbedding: owned?.hasEmbedding ?? false,
      };
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/spaced-repetition]", error);
    return NextResponse.json(
      { error: "Could not enroll notes" },
      { status: 500 },
    );
  }
}
