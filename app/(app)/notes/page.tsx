import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";
import { noteRecordToWorkspaceNote, sortWorkspaceNotes } from "@/lib/notes/records";
import { NotesWorkspace } from "@/app/notes/notes-workspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NotesPage(props: { searchParams?: SearchParams }) {
  await connection();

  const session = await requireServerSession("/notes");
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const classIdParam = Array.isArray(searchParams?.classId) ? searchParams.classId[0] : searchParams?.classId;
  const newParam = Array.isArray(searchParams?.new) ? searchParams.new[0] : searchParams?.new;
  const rows = await db
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
    .orderBy(desc(note.updatedAt));

  const initialNotes = sortWorkspaceNotes(rows.map((row) => noteRecordToWorkspaceNote(row)));
  const classSummaries = await listUserClasses(session.user.id);
  const classes = classSummaries.map((item) => ({
    id: item.courseId,
    runId: item.runId,
    title: item.title,
    courseCode: item.courseCode,
    noteCount: item.noteCount,
  }));
  const initialClassId: string | null =
    classIdParam && classes.some((item) => item.id === classIdParam) ? classIdParam : null;
  const resetSearchParams = new URLSearchParams();
  if (initialClassId) {
    resetSearchParams.set("classId", initialClassId);
  }
  const resetHref = resetSearchParams.size
    ? `/notes?${resetSearchParams.toString()}`
    : "/notes";

  return (
    <NotesWorkspace
      key={`${initialClassId ?? "all"}-${newParam === "1" ? "new" : "ready"}`}
      initialNotes={initialNotes}
      classes={classes}
      initialClassId={initialClassId}
      shouldCreateOnMount={newParam === "1"}
      resetHref={resetHref}
    />
  );
}
