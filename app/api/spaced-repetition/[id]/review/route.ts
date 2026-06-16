import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, spacedRepEntry } from "@/lib/db/schema";
import { applyReview, isReviewRating } from "@/lib/spaced-repetition/scheduling";
import type { SpacedRepEntryRecord } from "@/lib/spaced-repetition/records";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SESSION_SECONDS = 24 * 60 * 60; // guard against runaway timers

// POST /api/spaced-repetition/:id/review - record a completed study session
export async function POST(req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: { rating?: unknown; studySeconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isReviewRating(body.rating)) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const studySeconds =
    typeof body.studySeconds === "number" && Number.isFinite(body.studySeconds)
      ? Math.min(Math.max(Math.trunc(body.studySeconds), 0), MAX_SESSION_SECONDS)
      : 0;

  const [existing] = await db
    .select()
    .from(spacedRepEntry)
    .where(
      and(eq(spacedRepEntry.id, id), eq(spacedRepEntry.userId, session.user.id)),
    )
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const { stage, nextReviewAt } = applyReview(existing.stage, body.rating);

  try {
    const [updated] = await db
      .update(spacedRepEntry)
      .set({
        stage,
        nextReviewAt,
        reviewCount: existing.reviewCount + 1,
        totalStudySeconds: existing.totalStudySeconds + studySeconds,
        lastReviewedAt: new Date(),
        lastRating: body.rating,
      })
      .where(
        and(
          eq(spacedRepEntry.id, id),
          eq(spacedRepEntry.userId, session.user.id),
        ),
      )
      .returning();

    const [noteRow] = await db
      .select({
        title: note.title,
        markdown: note.markdown,
        hasEmbedding: sql<boolean>`${note.embedding} is not null`,
      })
      .from(note)
      .where(eq(note.id, updated.noteId))
      .limit(1);

    const record: SpacedRepEntryRecord = {
      id: updated.id,
      noteId: updated.noteId,
      noteTitle: noteRow?.title ?? "Untitled",
      markdown: noteRow?.markdown ?? "",
      stage: updated.stage,
      nextReviewAt: updated.nextReviewAt,
      lastReviewedAt: updated.lastReviewedAt,
      reviewCount: updated.reviewCount,
      totalStudySeconds: updated.totalStudySeconds,
      lastRating: updated.lastRating,
      hasEmbedding: noteRow?.hasEmbedding ?? false,
    };

    return NextResponse.json(record);
  } catch (error) {
    console.error("[POST /api/spaced-repetition/:id/review]", error);
    return NextResponse.json(
      { error: "Could not save review" },
      { status: 500 },
    );
  }
}
