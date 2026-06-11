import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizzes } from "@/lib/db/schema";
import { rowToSavedQuiz, saveQuizSchema } from "@/lib/quizzes/records";
import { hasQuizStorage, quizStorageUnavailableMessage } from "@/lib/quizzes/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const [updated] = await db
    .update(quizzes)
    .set({
      title: parsed.data.title.trim(),
      sourceNoteIds: Array.from(new Set(parsed.data.sourceNoteIds)),
      sourceNoteTitles: Array.from(new Set(parsed.data.sourceNoteTitles)),
      questions: parsed.data.questions,
      questionCount: parsed.data.questions.length,
      difficulty: parsed.data.difficulty,
      mode: parsed.data.mode,
      questionTypes: parsed.data.questionTypes,
      timeLimitMinutes: parsed.data.mode === "exam" ? parsed.data.timeLimitMinutes : null,
      updatedAt: new Date(),
    })
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ quiz: rowToSavedQuiz(updated) });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasQuizStorage())) {
    return NextResponse.json({ error: quizStorageUnavailableMessage }, { status: 503 });
  }

  const { id } = await ctx.params;
  const [deleted] = await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, session.user.id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
