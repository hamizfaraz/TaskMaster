import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import type { NoteDocument } from "@/lib/notes/types";
import { and, eq } from "drizzle-orm";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { normalizeNoteWriteContent, normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";
import { embedNote, shouldReembed } from "@/lib/notes/embedding";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Helper: fetch a note only if the authenticated user owns it
async function getUserNote(userId: string, noteId: string) {
  const [found] = await db
    .select()
    .from(note)
    .where(and(eq(note.id, noteId), eq(note.userId, userId)))
    .limit(1);
  return found ?? null;
}

/**
 * Uploaded notes keep their provenance — source file, topic index, the
 * original generated markdown and its embedding — under `noteGeneration`
 * inside the same `content` column that holds the derived block cache.
 * Replacing the column on every autosave destroyed it permanently, so
 * anything that is not the block document is carried across.
 */
function preserveGenerationMetadata(existingContent: unknown, nextDocument: NoteDocument) {
  if (!existingContent || typeof existingContent !== "object" || Array.isArray(existingContent)) {
    return nextDocument;
  }

  const generation = (existingContent as { noteGeneration?: unknown }).noteGeneration;
  return generation === undefined ? nextDocument : { ...nextDocument, noteGeneration: generation };
}

// GET /api/notes/:id
export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const found = await getUserNote(session.user.id, id);
  if (!found) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json(found);
}

// PATCH /api/notes/:id - update title and/or content
export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserNote(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  let body: { title?: string; content?: unknown; markdown?: unknown; classId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (existing.deletedAt) {
    return NextResponse.json({ error: "This note is in the trash" }, { status: 409 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim() || "Untitled";
  if (body.markdown !== undefined) {
    // Canonical path: markdown is stored as authored; blocks are derived.
    try {
      const content = normalizeNoteWriteMarkdown(body.markdown);
      updates.content = preserveGenerationMetadata(existing.content, content.document);
      updates.markdown = content.markdown;
    } catch {
      return NextResponse.json({ error: "Invalid note markdown" }, { status: 400 });
    }
  } else if (body.content !== undefined) {
    try {
      const content = normalizeNoteWriteContent(body.content);
      updates.content = preserveGenerationMetadata(existing.content, content.document);
      updates.markdown = content.markdown;
    } catch {
      return NextResponse.json(
        { error: "Invalid note content" },
        { status: 400 },
      );
    }
  }
  if (body.classId !== undefined) {
    // A note cannot be moved out of every class: unfiled is no longer a state.
    if (typeof body.classId !== "string" || !body.classId) {
      return NextResponse.json(
        { error: "A note must belong to a class." },
        { status: 400 },
      );
    }

    if (typeof body.classId === "string") {
      const ownedClass = await assertClassBelongsToUser(body.classId, session.user.id);
      if (!ownedClass) {
        return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
      }
    }

    updates.classId = body.classId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // Nothing used to embed a note on create or update, so notes written in the
  // editor never got a vector at all and edited uploads kept one describing
  // their previous text. Refresh here, throttled, and never let a failure take
  // the save down with it.
  const nextMarkdown = typeof updates.markdown === "string" ? updates.markdown : null;
  if (
    nextMarkdown !== null &&
    nextMarkdown !== existing.markdown &&
    shouldReembed({ embedding: existing.embedding, embeddingUpdatedAt: existing.embeddingUpdatedAt })
  ) {
    const embedding = await embedNote({
      title: typeof updates.title === "string" ? updates.title : existing.title,
      markdown: nextMarkdown,
    });
    if (embedding) {
      updates.embedding = embedding;
      updates.embeddingUpdatedAt = new Date();
    }
  }

  try {
    const [updated] = await db
      .update(note)
      .set(updates)
      .where(and(eq(note.id, id), eq(note.userId, session.user.id)))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/notes/:id]", error);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/:id
 *
 * Moves the note to the trash. Deleting used to destroy the row outright,
 * which made it the only irreversible action in the feature — and the bulk
 * path removes several at once.
 *
 * `?permanent=1` destroys it for real, which is what emptying the trash does.
 * Nothing purges on a timer: silently deleting a student's coursework after
 * N days is the wrong default.
 */
export async function DELETE(req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserNote(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const permanent = new URL(req.url).searchParams.get("permanent") === "1";

  try {
    if (permanent) {
      await db.delete(note).where(and(eq(note.id, id), eq(note.userId, session.user.id)));
      return NextResponse.json({ success: true, permanent: true });
    }

    await db
      .update(note)
      .set({ deletedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, session.user.id)));

    return NextResponse.json({ success: true, permanent: false });
  } catch (error) {
    console.error("[DELETE /api/notes/:id]", error);
    return NextResponse.json({ error: "Could not delete the note." }, { status: 500 });
  }
}

/** POST /api/notes/:id — take a note back out of the trash. */
export async function POST(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserNote(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  try {
    const [restored] = await db
      .update(note)
      .set({ deletedAt: null })
      .where(and(eq(note.id, id), eq(note.userId, session.user.id)))
      .returning();

    return NextResponse.json(restored);
  } catch (error) {
    console.error("[POST /api/notes/:id] restore", error);
    return NextResponse.json({ error: "Could not restore the note." }, { status: 500 });
  }
}
