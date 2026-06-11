import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { normalizeNoteWriteContent } from "@/lib/notes/persistence";

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

  let body: { title?: string; content?: unknown; classId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim() || "Untitled";
  if (body.content !== undefined) {
    try {
      const content = normalizeNoteWriteContent(body.content);
      updates.content = content.document;
      updates.markdown = content.markdown;
    } catch {
      return NextResponse.json(
        { error: "Invalid note content" },
        { status: 400 },
      );
    }
  }
  if (body.classId !== undefined) {
    if (body.classId !== null && typeof body.classId !== "string") {
      return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
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

  const [updated] = await db
    .update(note)
    .set(updates)
    .where(and(eq(note.id, id), eq(note.userId, session.user.id)))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/notes/:id
export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserNote(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await db
    .delete(note)
    .where(and(eq(note.id, id), eq(note.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
