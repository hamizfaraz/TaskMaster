import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  generateQuizQuestions,
  quizDifficulties,
  quizQuestionTypes,
} from "@/lib/quizzes/gemini";
import { getQuizContextNotes } from "@/lib/quizzes/context";

export const runtime = "nodejs";

const generateQuizSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(12),
  difficulty: z.enum(quizDifficulties),
  questionTypes: z.array(z.enum(quizQuestionTypes)).min(1),
  count: z.number().int().min(1).max(25),
  previousPrompts: z.array(z.string()).max(50).optional(),
});

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid quiz generation options" }, { status: 400 });
  }

  const contextNotes = await getQuizContextNotes({
    userId: session.user.id,
    noteIds: parsed.data.noteIds,
  });

  if (contextNotes.length !== new Set(parsed.data.noteIds).size) {
    return NextResponse.json({ error: "One or more selected notes could not be found" }, { status: 404 });
  }

  if (contextNotes.every((note) => note.embedding.length === 0)) {
    return NextResponse.json(
      { error: "Selected notes do not have stored embeddings yet" },
      { status: 400 },
    );
  }

  try {
    const questions = await generateQuizQuestions({
      notes: contextNotes,
      difficulty: parsed.data.difficulty,
      questionTypes: parsed.data.questionTypes,
      count: parsed.data.count,
      previousPrompts: parsed.data.previousPrompts,
    });

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("[POST /api/quizzes/generate]", error);
    return NextResponse.json({ error: "Quiz generation failed" }, { status: 500 });
  }
}
