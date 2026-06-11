import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type StorageProbeRow = {
  quizzes_exists: boolean;
  quiz_attempts_exists: boolean;
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

export async function hasQuizStorage() {
  try {
    const result = await db.execute(sql`
      select
        to_regclass('public.quizzes') is not null as "quizzes_exists",
        to_regclass('public.quiz_attempts') is not null as "quiz_attempts_exists"
    `);
    const row = getRows(result)[0];

    return Boolean(row?.quizzes_exists && row.quiz_attempts_exists);
  } catch {
    return false;
  }
}

export const quizStorageUnavailableMessage =
  "Quiz storage is not ready yet. Run the latest database migration before saving quizzes.";
