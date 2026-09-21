import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMap, mindMapEdge, mindMapNode } from "@/lib/db/schema";
import { guardMindMapRequest, loadOwnedMap } from "@/lib/mind-maps/api";
import { rowToMindMapDetail, rowToMindMapEdge, rowToMindMapNode } from "@/lib/mind-maps/records";
import { updateMapSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  const [nodes, edges] = await Promise.all([
    db.select().from(mindMapNode).where(eq(mindMapNode.mapId, id)),
    db.select().from(mindMapEdge).where(eq(mindMapEdge.mapId, id)),
  ]);

  return NextResponse.json({
    map: rowToMindMapDetail(map, nodes.map(rowToMindMapNode), edges.map(rowToMindMapEdge)),
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateMapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const [updated] = await db
    .update(mindMap)
    .set({ title: parsed.data.title, updatedAt: new Date() })
    .where(and(eq(mindMap.id, id), eq(mindMap.userId, guard.userId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  return NextResponse.json({ map: { id: updated.id, title: updated.title } });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const [deleted] = await db
    .delete(mindMap)
    .where(and(eq(mindMap.id, id), eq(mindMap.userId, guard.userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
