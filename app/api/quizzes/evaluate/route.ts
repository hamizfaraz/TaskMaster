import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  evaluateQuizAnswer,
  quizQuestionTypes,
  type QuizQuestion,
} from "@/lib/quizzes/gemini";

export const runtime = "nodejs";

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(quizQuestionTypes),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  sourceNoteTitles: z.array(z.string().min(1)).min(1),
});

const evaluateAnswerSchema = z.object({
  question: questionSchema,
  answer: z.string().min(1),
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

  const parsed = evaluateAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer payload" }, { status: 400 });
  }

  try {
    const evaluation = await evaluateQuizAnswer({
      question: parsed.data.question as QuizQuestion,
      answer: parsed.data.answer,
    });

    return NextResponse.json({ evaluation });
  } catch (error) {
    console.error("[POST /api/quizzes/evaluate]", error);
    return NextResponse.json({ error: "Answer evaluation failed" }, { status: 500 });
  }
}
