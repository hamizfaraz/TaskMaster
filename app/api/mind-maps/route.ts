import { NextResponse } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMap, mindMapEdge, mindMapNode } from "@/lib/db/schema";
import { guardMindMapRequest } from "@/lib/mind-maps/api";
import { rowToMindMapSummary } from "@/lib/mind-maps/records";
import { createMapSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

export async function GET() {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  const maps = await db
    .select()
    .from(mindMap)
    .where(eq(mindMap.userId, guard.userId))
    .orderBy(desc(mindMap.updatedAt));

  const mapIds = maps.map((map) => map.id);
  const nodeCounts = new Map<string, number>();
  const edgeCounts = new Map<string, number>();

  if (mapIds.length > 0) {
    const [nodeRows, edgeRows] = await Promise.all([
      db
        .select({ mapId: mindMapNode.mapId, total: count() })
        .from(mindMapNode)
        .where(inArray(mindMapNode.mapId, mapIds))
        .groupBy(mindMapNode.mapId),
      db
        .select({ mapId: mindMapEdge.mapId, total: count() })
        .from(mindMapEdge)
        .where(inArray(mindMapEdge.mapId, mapIds))
        .groupBy(mindMapEdge.mapId),
    ]);

    for (const row of nodeRows) nodeCounts.set(row.mapId, Number(row.total));
    for (const row of edgeRows) edgeCounts.set(row.mapId, Number(row.total));
  }

  return NextResponse.json({
    maps: maps.map((map) =>
      rowToMindMapSummary(map, nodeCounts.get(map.id) ?? 0, edgeCounts.get(map.id) ?? 0),
    ),
  });
}

export async function POST(req: Request) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createMapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(mindMap)
      .values({
        id: crypto.randomUUID(),
        userId: guard.userId,
        title: parsed.data.title,
      })
      .returning();

    return NextResponse.json({ map: rowToMindMapSummary(created, 0, 0) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mind-maps]", error);
    return NextResponse.json({ error: "Failed to create map" }, { status: 500 });
  }
}
