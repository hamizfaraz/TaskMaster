import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMapEdge } from "@/lib/db/schema";
import { guardMindMapRequest, loadOwnedMap } from "@/lib/mind-maps/api";
import { rowToMindMapEdge } from "@/lib/mind-maps/records";
import { updateEdgeSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; edgeId: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateEdgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, edgeId } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(mindMapEdge)
    .set({ label: parsed.data.label === "" ? null : parsed.data.label, updatedAt: new Date() })
    .where(and(eq(mindMapEdge.id, edgeId), eq(mindMapEdge.mapId, id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ edge: rowToMindMapEdge(updated) });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  const { id, edgeId } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  const [deleted] = await db
    .delete(mindMapEdge)
    .where(and(eq(mindMapEdge.id, edgeId), eq(mindMapEdge.mapId, id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
