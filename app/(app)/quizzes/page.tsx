import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, quizAttempts, quizzes } from "@/lib/db/schema";
import { requireServerSession } from "@/lib/auth-session";
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
      embedding: note.embedding,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .where(eq(note.userId, session.user.id))
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

  return (
    <QuizzesClient
      notes={noteRows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        hasEmbedding: Array.isArray(row.embedding) && row.embedding.length > 0,
      }))}
      initialQuizzes={quizRows.map(rowToSavedQuiz)}
      initialAttempts={attemptRows.map(rowToQuizAttempt)}
    />
  );
}
