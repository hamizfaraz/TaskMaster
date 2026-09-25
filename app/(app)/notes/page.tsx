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

  // The client never reads a note's vector, and shipping 768 floats per note
  // into the RSC payload costs roughly 1.5 MB at 100 notes. The embedding is
  // still read above so `hasEmbedding`-style derivations stay correct; only
  // the vector itself is dropped before it crosses the wire.
  const initialNotes = sortWorkspaceNotes(
    rows.map((row) => {
      const workspaceNote = noteRecordToWorkspaceNote(row);
      return {
        ...workspaceNote,
        embedding: workspaceNote.embedding && workspaceNote.embedding.length > 0 ? [] : workspaceNote.embedding,
        generation: workspaceNote.generation
          ? { ...workspaceNote.generation, embedding: [] }
          : workspaceNote.generation,
      };
    }),
  );
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
