import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { cheatSheet } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { normalizeNoteWriteContent } from "@/lib/notes/persistence";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Helper: fetch a cheat sheet only if the authenticated user owns it
async function getUserCheatSheet(userId: string, sheetId: string) {
  const [found] = await db
    .select()
    .from(cheatSheet)
    .where(and(eq(cheatSheet.id, sheetId), eq(cheatSheet.userId, userId)))
    .limit(1);
  return found ?? null;
}

// PATCH /api/cheat-sheets/:id - update title and/or content and/or class
export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserCheatSheet(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Cheat sheet not found" }, { status: 404 });
  }

  let body: { title?: string; content?: unknown; classId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    updates.title = body.title.trim() || "Untitled";
  }
  if (body.content !== undefined) {
    try {
      const content = normalizeNoteWriteContent(body.content);
      updates.content = content.document;
      updates.markdown = content.markdown;
    } catch {
      return NextResponse.json(
        { error: "Invalid cheat sheet content" },
        { status: 400 },
      );
    }
  }
  if (body.classId !== undefined) {
    if (body.classId !== null && typeof body.classId !== "string") {
      return NextResponse.json(
        { error: "Invalid class selection" },
        { status: 400 },
      );
    }

    if (typeof body.classId === "string") {
      const ownedClass = await assertClassBelongsToUser(
        body.classId,
        session.user.id,
      );
      if (!ownedClass) {
        return NextResponse.json(
          { error: "Invalid class selection" },
          { status: 400 },
        );
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

  try {
    const [updated] = await db
      .update(cheatSheet)
      .set(updates)
      .where(and(eq(cheatSheet.id, id), eq(cheatSheet.userId, session.user.id)))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/cheat-sheets/:id]", error);
    return NextResponse.json(
      { error: "Could not save cheat sheet" },
      { status: 500 },
    );
  }
}

// DELETE /api/cheat-sheets/:id
export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserCheatSheet(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Cheat sheet not found" }, { status: 404 });
  }

  try {
    await db
      .delete(cheatSheet)
      .where(and(eq(cheatSheet.id, id), eq(cheatSheet.userId, session.user.id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cheat-sheets/:id]", error);
    return NextResponse.json(
      { error: "Could not delete cheat sheet" },
      { status: 500 },
    );
  }
}
