import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type StorageProbeRow = {
  sheet_exists: boolean;
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

export async function hasCheatSheetStorage() {
  try {
    const result = await db.execute(sql`
      select to_regclass('public.cheat_sheet') is not null as "sheet_exists"
    `);
    const row = getRows(result)[0];

    return Boolean(row?.sheet_exists);
  } catch {
    return false;
  }
}

export const cheatSheetStorageUnavailableMessage =
  "Cheat sheet storage is not ready yet. Run the latest database migration before saving cheat sheets.";
