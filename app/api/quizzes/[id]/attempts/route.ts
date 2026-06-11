import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { quizAttempts, quizzes } from "@/lib/db/schema";
import { rowToQuizAttempt, saveAttemptSchema } from "@/lib/quizzes/records";
import { hasQuizStorage, quizStorageUnavailableMessage } from "@/lib/quizzes/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedQuiz(userId: string, quizId: string) {
  const [found] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
    .limit(1);

  return found ?? null;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasQuizStorage())) {
    return NextResponse.json({ attempts: [] });
  }

  const { id } = await ctx.params;
  if (!(await getOwnedQuiz(session.user.id, id))) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, id), eq(quizAttempts.userId, session.user.id)))
    .orderBy(desc(quizAttempts.completedAt));

  return NextResponse.json({ attempts: rows.map(rowToQuizAttempt) });
}

export async function POST(req: Request, ctx: RouteContext) {
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

  const parsed = saveAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid attempt payload" }, { status: 400 });
  }

  const { id } = await ctx.params;
  if (!(await getOwnedQuiz(session.user.id, id))) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const [created] = await db
    .insert(quizAttempts)
    .values({
      quizId: id,
      userId: session.user.id,
      answers: parsed.data.answers,
      score: parsed.data.score,
      correctCount: parsed.data.correctCount,
      answeredCount: parsed.data.answeredCount,
      questionCount: parsed.data.questionCount,
      timeSpentSeconds: parsed.data.timeSpentSeconds,
      mode: parsed.data.mode,
    })
    .returning();

  return NextResponse.json({ attempt: rowToQuizAttempt(created) }, { status: 201 });
}
