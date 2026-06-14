import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mindMap, mindMapNode } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { guardMindMapRequest, loadOwnedMap } from "@/lib/mind-maps/api";
import { rowToMindMapNode } from "@/lib/mind-maps/records";
import { createNodeSchema } from "@/lib/mind-maps/types";

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

  const parsed = createNodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const map = await loadOwnedMap(id, guard.userId);
  if (!map) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  try {
    const [created] = await db
      .insert(mindMapNode)
      .values({
        id: crypto.randomUUID(),
        mapId: id,
        label: parsed.data.label,
        positionX: parsed.data.positionX,
        positionY: parsed.data.positionY,
      })
      .returning();

    // Touch the map so library ordering reflects recent activity.
    await db.update(mindMap).set({ updatedAt: new Date() }).where(eq(mindMap.id, id));

    return NextResponse.json({ node: rowToMindMapNode(created) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mind-maps/[id]/nodes]", error);
    return NextResponse.json({ error: "Failed to add topic" }, { status: 500 });
  }
}
