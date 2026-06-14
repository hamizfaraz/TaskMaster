import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMapNode } from "@/lib/db/schema";
import { guardMindMapRequest, loadOwnedMap } from "@/lib/mind-maps/api";
import { rowToMindMapNode } from "@/lib/mind-maps/records";
import { updateNodeSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateNodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, nodeId } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(mindMapNode)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(mindMapNode.id, nodeId), eq(mindMapNode.mapId, id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  return NextResponse.json({ node: rowToMindMapNode(updated) });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  const { id, nodeId } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  // Connected edges cascade via the FK on source/target node ids.
  const [deleted] = await db
    .delete(mindMapNode)
    .where(and(eq(mindMapNode.id, nodeId), eq(mindMapNode.mapId, id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
