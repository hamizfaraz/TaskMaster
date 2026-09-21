import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type StorageProbeRow = {
  map_exists: boolean;
  node_exists: boolean;
  edge_exists: boolean;
};

function getRows(result: unknown): StorageProbeRow[] {
  if (Array.isArray(result)) {
    return result as StorageProbeRow[];
  }

  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: StorageProbeRow[] }).rows;
  }

  return [];
}

export async function hasMindMapStorage() {
  try {
    const result = await db.execute(sql`
      select
        to_regclass('public.mind_map') is not null as "map_exists",
        to_regclass('public.mind_map_node') is not null as "node_exists",
        to_regclass('public.mind_map_edge') is not null as "edge_exists"
    `);
    const row = getRows(result)[0];

    return Boolean(row?.map_exists && row.node_exists && row.edge_exists);
  } catch {
    return false;
  }
}

export const mindMapStorageUnavailableMessage =
  "Association map storage is not ready yet. Run the latest database migration before saving maps.";
