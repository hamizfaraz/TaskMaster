import { connection } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mindMap, mindMapEdge, mindMapNode, note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { AssociationsClient } from "@/app/associations/associations-client";
import { rowToMindMapSummary } from "@/lib/mind-maps/records";
import { hasMindMapStorage } from "@/lib/mind-maps/storage";

export default async function AssociationsPage() {
  await connection();

  const session = await requireServerSession("/study/associations");
  const storageReady = await hasMindMapStorage();

  if (!storageReady) {
    return <AssociationsClient initialMaps={[]} notes={[]} storageReady={false} />;
  }

  const [maps, noteRows] = await Promise.all([
    db
      .select()
      .from(mindMap)
      .where(eq(mindMap.userId, session.user.id))
      .orderBy(desc(mindMap.updatedAt)),
    db
      .select({
        id: note.id,
        title: note.title,
        embedding: note.embedding,
        updatedAt: note.updatedAt,
      })
      .from(note)
      .where(eq(note.userId, session.user.id))
      .orderBy(desc(note.updatedAt)),
  ]);

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

  return (
    <AssociationsClient
      initialMaps={maps.map((map) =>
        rowToMindMapSummary(map, nodeCounts.get(map.id) ?? 0, edgeCounts.get(map.id) ?? 0),
      )}
      notes={noteRows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        hasEmbedding: Array.isArray(row.embedding) && row.embedding.length > 0,
      }))}
      storageReady
    />
  );
}
