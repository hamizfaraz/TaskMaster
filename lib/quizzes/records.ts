import { z } from "zod";
import {
  quizDifficulties,
  quizQuestionTypes,
  type QuizDifficulty,
  type QuizQuestion,
  type QuizQuestionType,
} from "@/lib/quizzes/gemini";
import type { QuizAttempt, QuizAttemptAnswer, QuizMode, SavedQuiz } from "@/lib/quizzes/types";

export const quizModes = ["practice", "exam"] as const;

export const quizQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(quizQuestionTypes),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  sourceNoteTitles: z.array(z.string().min(1)).min(1),
});

export const quizAttemptAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string(),
  evaluation: z
    .object({
      correct: z.boolean(),
      score: z.number().min(0).max(1),
      feedback: z.string().min(1),
      idealAnswer: z.string().min(1),
    })
    .optional(),
});

export const saveQuizSchema = z.object({
  title: z.string().min(1).max(120),
  sourceNoteIds: z.array(z.string().min(1)).min(1).max(12),
  sourceNoteTitles: z.array(z.string().min(1)).min(1).max(24),
  questions: z.array(quizQuestionSchema).min(1).max(50),
  difficulty: z.enum(quizDifficulties),
  mode: z.enum(quizModes),
  questionTypes: z.array(z.enum(quizQuestionTypes)).min(1).max(3),
  timeLimitMinutes: z.number().int().min(1).max(240).nullable(),
});

export const saveAttemptSchema = z.object({
  answers: z.array(quizAttemptAnswerSchema),
  score: z.number().min(0).max(1),
  correctCount: z.number().int().min(0),
  answeredCount: z.number().int().min(0),
  questionCount: z.number().int().min(1),
  timeSpentSeconds: z.number().int().min(0).nullable(),
  mode: z.enum(quizModes),
});

function normalizeQuestions(value: unknown): QuizQuestion[] {
  const parsed = z.array(quizQuestionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function normalizeQuestionTypes(value: string[]): QuizQuestionType[] {
  return value.filter((item): item is QuizQuestionType =>
    quizQuestionTypes.includes(item as QuizQuestionType),
  );
}

function normalizeDifficulty(value: string): QuizDifficulty {
  return quizDifficulties.includes(value as QuizDifficulty) ? (value as QuizDifficulty) : "medium";
}

function normalizeMode(value: string): QuizMode {
  return quizModes.includes(value as QuizMode) ? (value as QuizMode) : "practice";
}

function normalizeAttemptAnswers(value: unknown): QuizAttemptAnswer[] {
  const parsed = z.array(quizAttemptAnswerSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function rowToSavedQuiz(row: {
  id: string;
  title: string;
  sourceNoteIds: string[];
  sourceNoteTitles: string[];
  questions: unknown;
  questionCount: number;
  difficulty: string;
  mode: string;
  questionTypes: string[];
  timeLimitMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}): SavedQuiz {
  return {
    id: row.id,
    title: row.title,
    sourceNoteIds: row.sourceNoteIds,
    sourceNoteTitles: row.sourceNoteTitles,
    questions: normalizeQuestions(row.questions),
    questionCount: row.questionCount,
    difficulty: normalizeDifficulty(row.difficulty),
    mode: normalizeMode(row.mode),
    questionTypes: normalizeQuestionTypes(row.questionTypes),
    timeLimitMinutes: row.timeLimitMinutes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToQuizAttempt(row: {
  id: string;
  quizId: string;
  answers: unknown;
  score: number;
  correctCount: number;
  answeredCount: number;
  questionCount: number;
  completedAt: Date;
  timeSpentSeconds: number | null;
  mode: string;
  createdAt: Date;
}): QuizAttempt {
  return {
    id: row.id,
    quizId: row.quizId,
    answers: normalizeAttemptAnswers(row.answers),
    score: row.score,
    correctCount: row.correctCount,
    answeredCount: row.answeredCount,
    questionCount: row.questionCount,
    completedAt: row.completedAt.toISOString(),
    timeSpentSeconds: row.timeSpentSeconds,
    mode: normalizeMode(row.mode),
    createdAt: row.createdAt.toISOString(),
  };
}
