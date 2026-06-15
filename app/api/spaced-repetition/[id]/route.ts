import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { spacedRepEntry } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Helper: fetch an entry only if the authenticated user owns it
async function getUserEntry(userId: string, entryId: string) {
  const [found] = await db
    .select()
    .from(spacedRepEntry)
    .where(
      and(eq(spacedRepEntry.id, entryId), eq(spacedRepEntry.userId, userId)),
    )
    .limit(1);
  return found ?? null;
}

// DELETE /api/spaced-repetition/:id - unenroll a note from the schedule
export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getUserEntry(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  try {
    await db
      .delete(spacedRepEntry)
      .where(
        and(
          eq(spacedRepEntry.id, id),
          eq(spacedRepEntry.userId, session.user.id),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/spaced-repetition/:id]", error);
    return NextResponse.json(
      { error: "Could not remove entry" },
      { status: 500 },
    );
  }
}
