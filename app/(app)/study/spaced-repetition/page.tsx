import { connection } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { listUserEntries } from "@/lib/spaced-repetition/queries";
import { rowToEntry, sortEntries } from "@/lib/spaced-repetition/records";
import { hasSpacedRepetitionStorage } from "@/lib/spaced-repetition/storage";
import { SpacedRepetitionWorkspace } from "@/app/spaced-repetition/spaced-repetition-workspace";

export default async function SpacedRepetitionPage() {
  await connection();

  const session = await requireServerSession("/study/spaced-repetition");
  const storageReady = await hasSpacedRepetitionStorage();

  const [entryRows, noteRows] = await Promise.all([
    storageReady ? listUserEntries(session.user.id) : Promise.resolve([]),
    db
      .select({
        id: note.id,
        title: note.title,
        hasEmbedding: sql<boolean>`${note.embedding} is not null`,
      })
      .from(note)
      .where(eq(note.userId, session.user.id))
      .orderBy(desc(note.updatedAt)),
  ]);

  const initialEntries = sortEntries(entryRows.map(rowToEntry));
  const availableNotes = noteRows.map((row) => ({
    id: row.id,
    title: row.title,
    hasEmbedding: row.hasEmbedding,
  }));

  return (
    <div className="h-full min-h-0">
      <SpacedRepetitionWorkspace
        initialEntries={initialEntries}
        notes={availableNotes}
        storageReady={storageReady}
      />
    </div>
  );
}
