import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type StorageProbeRow = {
  entry_exists: boolean;
};

function getRows(result: unknown): StorageProbeRow[] {
  if (Array.isArray(result)) {
    return result as StorageProbeRow[];
  }

  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: StorageProbeRow[] }).rows;
  }

  return [];
}

export async function hasSpacedRepetitionStorage() {
  try {
    const result = await db.execute(sql`
      select to_regclass('public.spaced_rep_entry') is not null as "entry_exists"
    `);
    const row = getRows(result)[0];

    return Boolean(row?.entry_exists);
  } catch {
    return false;
  }
}

export const spacedRepetitionStorageUnavailableMessage =
  "Spaced repetition storage is not ready yet. Run the latest database migration before enrolling notes.";
