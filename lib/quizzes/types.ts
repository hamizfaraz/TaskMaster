import type { QuizDifficulty, QuizQuestion, QuizQuestionType } from "@/lib/quizzes/gemini";

export type QuizMode = "practice" | "exam";

export type SavedQuiz = {
  id: string;
  title: string;
  sourceNoteIds: string[];
  sourceNoteTitles: string[];
  questions: QuizQuestion[];
  questionCount: number;
  difficulty: QuizDifficulty;
  mode: QuizMode;
  questionTypes: QuizQuestionType[];
  timeLimitMinutes: number | null;
  createdAt: string;
  updatedAt: string;
};

export type QuizEvaluation = {
  correct: boolean;
  score: number;
  feedback: string;
  idealAnswer: string;
};

export type QuizAttemptAnswer = {
  questionId: string;
  answer: string;
  evaluation?: QuizEvaluation;
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  answers: QuizAttemptAnswer[];
  score: number;
  correctCount: number;
  answeredCount: number;
  questionCount: number;
  completedAt: string;
  timeSpentSeconds: number | null;
  mode: QuizMode;
  createdAt: string;
};
