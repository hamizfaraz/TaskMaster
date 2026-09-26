import { connection } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, quizAttempts, quizzes } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";
import { QuizzesClient } from "@/app/quizzes/quizzes-client";
import { rowToQuizAttempt, rowToSavedQuiz } from "@/lib/quizzes/records";
import { hasQuizStorage } from "@/lib/quizzes/storage";

export default async function QuizzesPage() {
  await connection();

  const session = await requireServerSession("/quizzes");
  const noteRows = await db
    .select({
      id: note.id,
      title: note.title,
      classId: note.classId,
      embedding: note.embedding,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .where(and(eq(note.userId, session.user.id), isNull(note.deletedAt)))
    .orderBy(desc(note.updatedAt));

  const quizStorageReady = await hasQuizStorage();
  const { quizRows, attemptRows } = quizStorageReady
    ? await Promise.all([
        db
          .select()
          .from(quizzes)
          .where(eq(quizzes.userId, session.user.id))
          .orderBy(desc(quizzes.updatedAt)),
        db
          .select()
          .from(quizAttempts)
          .where(eq(quizAttempts.userId, session.user.id))
          .orderBy(desc(quizAttempts.completedAt)),
      ]).then(([loadedQuizRows, loadedAttemptRows]) => ({
        quizRows: loadedQuizRows,
        attemptRows: loadedAttemptRows,
      }))
    : { quizRows: [], attemptRows: [] };

  // Every note belongs to a class now, so the picker can say which one
  // instead of showing a flat list that spans courses.
  const classLabels = new Map(
    (await listUserClasses(session.user.id)).map((item) => [
      item.courseId,
      item.courseCode ? `${item.courseCode}` : item.title,
    ]),
  );

  return (
    <QuizzesClient
      notes={noteRows.map((row) => ({
        id: row.id,
        title: row.title,
        className: classLabels.get(row.classId ?? "") ?? null,
        updatedAt: row.updatedAt.toISOString(),
        hasEmbedding: Array.isArray(row.embedding) && row.embedding.length > 0,
      }))}
      initialQuizzes={quizRows.map(rowToSavedQuiz)}
      initialAttempts={attemptRows.map(rowToQuizAttempt)}
    />
  );
}
