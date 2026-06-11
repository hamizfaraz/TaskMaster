import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { rowToSavedQuiz, saveQuizSchema } from "@/lib/quizzes/records";
import { hasQuizStorage, quizStorageUnavailableMessage } from "@/lib/quizzes/storage";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasQuizStorage())) {
    return NextResponse.json({ quizzes: [] });
  }

  const rows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.userId, session.user.id))
    .orderBy(desc(quizzes.updatedAt));

  return NextResponse.json({ quizzes: rows.map(rowToSavedQuiz) });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasQuizStorage())) {
    return NextResponse.json({ error: quizStorageUnavailableMessage }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = saveQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quiz payload" }, { status: 400 });
  }

  const [created] = await db
    .insert(quizzes)
    .values({
      userId: session.user.id,
      title: parsed.data.title.trim(),
      sourceNoteIds: Array.from(new Set(parsed.data.sourceNoteIds)),
      sourceNoteTitles: Array.from(new Set(parsed.data.sourceNoteTitles)),
      questions: parsed.data.questions,
      questionCount: parsed.data.questions.length,
      difficulty: parsed.data.difficulty,
      mode: parsed.data.mode,
      questionTypes: parsed.data.questionTypes,
      timeLimitMinutes: parsed.data.mode === "exam" ? parsed.data.timeLimitMinutes : null,
    })
    .returning();

  return NextResponse.json({ quiz: rowToSavedQuiz(created) }, { status: 201 });
}
