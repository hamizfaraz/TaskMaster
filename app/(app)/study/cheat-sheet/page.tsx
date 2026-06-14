import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cheatSheet, note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";
import { noteRecordToWorkspaceNote, sortWorkspaceNotes } from "@/lib/notes/records";
import { rowToCheatSheet, sortCheatSheets } from "@/lib/cheat-sheets/records";
import { hasCheatSheetStorage } from "@/lib/cheat-sheets/storage";
import { NotesWorkspace } from "@/app/notes/notes-workspace";
import { CheatSheetWorkspace } from "@/app/cheat-sheet/cheat-sheet-workspace";

export default async function CheatSheetPage() {
  await connection();

  const session = await requireServerSession("/study/cheat-sheet");
  const storageReady = await hasCheatSheetStorage();

  const [noteRows, classSummaries, sheetRows] = await Promise.all([
    db
      .select({
        id: note.id,
        title: note.title,
        classId: note.classId,
        content: note.content,
        markdown: note.markdown,
        sourceType: note.sourceType,
        fileName: note.fileName,
        mimeType: note.mimeType,
        fileSize: note.fileSize,
        embedding: note.embedding,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })
      .from(note)
      .where(eq(note.userId, session.user.id))
      .orderBy(desc(note.updatedAt)),
    listUserClasses(session.user.id),
    storageReady
      ? db
          .select({
            id: cheatSheet.id,
            title: cheatSheet.title,
            classId: cheatSheet.classId,
            content: cheatSheet.content,
            markdown: cheatSheet.markdown,
            createdAt: cheatSheet.createdAt,
            updatedAt: cheatSheet.updatedAt,
          })
          .from(cheatSheet)
          .where(eq(cheatSheet.userId, session.user.id))
          .orderBy(desc(cheatSheet.updatedAt))
      : Promise.resolve([]),
  ]);

  const initialNotes = sortWorkspaceNotes(
    noteRows.map((row) => noteRecordToWorkspaceNote(row)),
  );
  const notesClasses = classSummaries.map((item) => ({
    id: item.courseId,
    runId: item.runId,
    title: item.title,
    courseCode: item.courseCode,
    noteCount: item.noteCount,
  }));
  const cheatSheetClasses = classSummaries.map((item) => ({
    id: item.courseId,
    title: item.title,
    courseCode: item.courseCode,
  }));
  const initialCheatSheets = sortCheatSheets(
    sheetRows.map((row) => rowToCheatSheet(row)),
  );

  return (
    <div className="grid h-full min-h-0 overflow-hidden rounded-[var(--radius-xl)] border border-border lg:grid-cols-2">
      {/* Left: existing Notes workspace (reused, fully editable) */}
      <div className="min-h-0 overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
        <NotesWorkspace
          initialNotes={initialNotes}
          classes={notesClasses}
          initialClassId={null}
          shouldCreateOnMount={false}
          resetHref="/study/cheat-sheet"
        />
      </div>

      {/* Right: cheat-sheet workspace (you write these by hand) */}
      <div className="min-h-0 overflow-hidden">
        <CheatSheetWorkspace
          initialCheatSheets={initialCheatSheets}
          classes={cheatSheetClasses}
          storageReady={storageReady}
        />
      </div>
    </div>
  );
}
