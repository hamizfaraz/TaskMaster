import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parseTestRun } from "@/lib/db/schema";
import { CLASS_ARCHIVE_WARNING } from "./archive-marker";

export async function setClassArchived(params: {
  userId: string;
  runId: string;
  archived: boolean;
}) {
  const [run] = await db
    .select({
      id: parseTestRun.id,
      warnings: parseTestRun.warnings,
    })
    .from(parseTestRun)
    .where(and(eq(parseTestRun.id, params.runId), eq(parseTestRun.userId, params.userId)))
    .limit(1);

  if (!run) {
    return null;
  }

  const warnings = run.warnings.filter((warning) => warning !== CLASS_ARCHIVE_WARNING);
  const nextWarnings = params.archived ? [...warnings, CLASS_ARCHIVE_WARNING] : warnings;

  const [updated] = await db
    .update(parseTestRun)
    .set({
      warnings: nextWarnings,
      updatedAt: new Date(),
    })
    .where(and(eq(parseTestRun.id, params.runId), eq(parseTestRun.userId, params.userId)))
    .returning();

  return updated ?? null;
}
