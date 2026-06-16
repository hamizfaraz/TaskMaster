import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMap, mindMapEdge, mindMapNode } from "@/lib/db/schema";
import { guardMindMapRequest, loadOwnedMap } from "@/lib/mind-maps/api";
import { rowToMindMapEdge } from "@/lib/mind-maps/records";
import { createEdgeSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createEdgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  // Both endpoints must be topics within this map.
  const endpoints = await db
    .select({ id: mindMapNode.id })
    .from(mindMapNode)
    .where(
      and(
        eq(mindMapNode.mapId, id),
        inArray(mindMapNode.id, [parsed.data.sourceNodeId, parsed.data.targetNodeId]),
      ),
    );

  if (endpoints.length !== 2) {
    return NextResponse.json({ error: "Both topics must belong to this map" }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(mindMapEdge)
      .values({
        id: crypto.randomUUID(),
        mapId: id,
        sourceNodeId: parsed.data.sourceNodeId,
        targetNodeId: parsed.data.targetNodeId,
        label: parsed.data.label ?? null,
      })
      .returning();

    await db.update(mindMap).set({ updatedAt: new Date() }).where(eq(mindMap.id, id));

    return NextResponse.json({ edge: rowToMindMapEdge(created) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mind-maps/[id]/edges]", error);
    return NextResponse.json({ error: "Failed to connect topics" }, { status: 500 });
  }
}
