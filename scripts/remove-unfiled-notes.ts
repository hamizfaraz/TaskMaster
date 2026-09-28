/**
 * Move every note without a class to the trash.
 *
 * Notes must belong to a class, so an unfiled note is no longer a valid state.
 * This uses the soft delete rather than destroying rows: the change is large
 * (most of a library) and several unfiled notes clearly belong to classes that
 * already exist, so it has to stay recoverable from the sidebar's Trash.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/remove-unfiled-notes.ts
 *   pnpm exec tsx --env-file=.env.local scripts/remove-unfiled-notes.ts --apply
 */
import { and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";

const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ id: note.id, title: note.title, markdown: note.markdown })
    .from(note)
    .where(and(isNull(note.classId), isNull(note.deletedAt)));

  const withText = rows.filter((row) => row.markdown.trim().length > 0);
  console.log(
    `${rows.length} unfiled note(s), ${withText.length} of them with text ` +
      `(${withText.reduce((sum, row) => sum + row.markdown.length, 0).toLocaleString()} chars)\n`,
  );

  for (const row of rows) {
    console.log(
      `  ${apply ? "TRASH" : "would"}  ${String(row.markdown.trim().length).padStart(6)}b  ${row.title.slice(0, 62)}`,
    );
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to move them to the trash.");
    return;
  }

  const moved = await db
    .update(note)
    .set({ deletedAt: new Date() })
    .where(and(isNull(note.classId), isNull(note.deletedAt)))
    .returning();

  console.log(`\nMoved ${moved.length} note(s) to the trash. Restore from the sidebar if needed.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
