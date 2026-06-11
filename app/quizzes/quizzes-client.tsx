"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileQuestion,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  createUnansweredEvaluation,
  gradeObjectiveAnswer,
  summarizeAttempt,
} from "@/lib/quizzes/attempts";
import type {
  QuizDifficulty,
  QuizQuestion,
  QuizQuestionType,
} from "@/lib/quizzes/gemini";
import type {
  QuizAttempt,
  QuizAttemptAnswer,
  QuizEvaluation,
  QuizMode,
  SavedQuiz,
} from "@/lib/quizzes/types";
import { cx } from "@/lib/utils";

type QuizNoteOption = {
  id: string;
  title: string;
  updatedAt: string;
  hasEmbedding: boolean;
};

type QuizzesClientProps = {
  notes: QuizNoteOption[];
  initialQuizzes: SavedQuiz[];
  initialAttempts: QuizAttempt[];
};

type View = "library" | "create" | "preview" | "take" | "results";

const questionTypeOptions: Array<{ value: QuizQuestionType; label: string }> = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "free_response", label: "Free response" },
  { value: "true_false", label: "True / false" },
];

const difficultyOptions: Array<{ value: QuizDifficulty; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const modeOptions: Array<{
  value: QuizMode;
  label: string;
  description: string;
}> = [
  {
    value: "practice",
    label: "Practice",
    description: "Immediate checking while taking the quiz.",
  },
  {
    value: "exam",
    label: "Exam",
    description: "Timed attempt with results after finish.",
  },
];

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }

  return payload;
}

function MarkdownText({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cx("quiz-markdown min-w-0 text-foreground", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className: codeClassName }) => (
            <code
              className={cx(
                "rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.92em]",
                codeClassName,
              )}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface-muted p-3 text-sm">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function StepPill({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium",
        active
          ? "border-accent/20 bg-accent-soft text-accent"
          : "border-border bg-transparent text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function StatPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-border bg-transparent px-3 text-sm font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function makeDraftQuestion(sourceNoteTitles: string[]): QuizQuestion {
  return {
    id: crypto.randomUUID(),
    type: "free_response",
    prompt: "",
    correctAnswer: "",
    explanation: "",
    sourceNoteTitles,
  };
}

function getSourceTitles(
  questions: QuizQuestion[],
  notes: QuizNoteOption[],
  selectedNoteIds: string[],
) {
  const titles = questions.flatMap((question) => question.sourceNoteTitles);
  if (titles.length > 0) {
    return Array.from(new Set(titles));
  }

  return notes
    .filter((note) => selectedNoteIds.includes(note.id))
    .map((note) => note.title);
}

function createQuizCopy(
  quiz: SavedQuiz,
): Omit<SavedQuiz, "id" | "createdAt" | "updatedAt"> {
  return {
    title: `${quiz.title} copy`,
    sourceNoteIds: quiz.sourceNoteIds,
    sourceNoteTitles: quiz.sourceNoteTitles,
    questions: quiz.questions.map((question) => ({
      ...question,
      id: crypto.randomUUID(),
    })),
    questionCount: quiz.questionCount,
    difficulty: quiz.difficulty,
    mode: quiz.mode,
    questionTypes: quiz.questionTypes,
    timeLimitMinutes: quiz.timeLimitMinutes,
  };
}

export function QuizzesClient({
  notes,
  initialQuizzes,
  initialAttempts,
}: QuizzesClientProps) {
  const embeddedNotes = useMemo(
    () => notes.filter((note) => note.hasEmbedding),
    [notes],
  );
  const [quizzes, setQuizzes] = useState<SavedQuiz[]>(initialQuizzes);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(initialAttempts);
  const [view, setView] = useState<View>("library");
  const [activeQuizId, setActiveQuizId] = useState(initialQuizzes[0]?.id ?? "");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");

  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [mode, setMode] = useState<QuizMode>("practice");
  const [timeMinutes, setTimeMinutes] = useState(20);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionTypes, setQuestionTypes] = useState<QuizQuestionType[]>([
    "multiple_choice",
  ]);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<QuizQuestion[]>([]);
  const [draftQuestionIndex, setDraftQuestionIndex] = useState(0);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, QuizAttemptAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<QuizAttempt | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [deleteQuizId, setDeleteQuizId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeQuiz =
    quizzes.find((quiz) => quiz.id === activeQuizId) ?? quizzes[0] ?? null;
  const activeAttempts = attempts.filter(
    (attempt) => attempt.quizId === activeQuiz?.id,
  );
  const selectedAttempt =
    attempts.find((attempt) => attempt.id === selectedAttemptId) ??
    latestAttempt ??
    activeAttempts[0] ??
    null;
  const currentQuestion = activeQuiz?.questions[currentIndex] ?? null;
  const activeDraftQuestion = draftQuestions[draftQuestionIndex] ?? null;
  const currentAnswer = currentQuestion
    ? (answers[currentQuestion.id]?.answer ?? "")
    : "";
  const currentEvaluation = currentQuestion
    ? answers[currentQuestion.id]?.evaluation
    : undefined;
  const canGenerate =
    selectedNoteIds.length > 0 &&
    questionTypes.length > 0 &&
    embeddedNotes.length > 0 &&
    !isGenerating;
  const examExpired = activeQuiz?.mode === "exam" && remainingSeconds <= 0;

  useEffect(() => {
    if (
      view !== "take" ||
      activeQuiz?.mode !== "exam" ||
      remainingSeconds <= 0 ||
      isFinishing
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeQuiz?.mode, isFinishing, remainingSeconds, view]);

  useEffect(() => {
    setDraftQuestionIndex((index) =>
      Math.min(Math.max(index, 0), Math.max(draftQuestions.length - 1, 0)),
    );
  }, [draftQuestions.length]);

  function resetCreateForm() {
    setSelectedNoteIds([]);
    setMode("practice");
    setTimeMinutes(20);
    setQuestionCount(10);
    setQuestionTypes(["multiple_choice"]);
    setDifficulty("medium");
    setDraftTitle("");
    setDraftQuestions([]);
    setDraftQuestionIndex(0);
    setEditingQuizId(null);
  }

  function openLibrary(quizId?: string) {
    setView("library");
    setError(null);
    setLatestAttempt(null);
    if (quizId) {
      setActiveQuizId(quizId);
    }
  }

  function openCreate() {
    resetCreateForm();
    setView("create");
    setError(null);
  }

  function toggleNote(noteId: string) {
    setSelectedNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId],
    );
  }

  function toggleQuestionType(type: QuizQuestionType) {
    setQuestionTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  async function generatePreview() {
    setError(null);
    setIsGenerating(true);
    try {
      const payload = await readJsonResponse<{ questions: QuizQuestion[] }>(
        await fetch("/api/quizzes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteIds: selectedNoteIds,
            difficulty,
            questionTypes,
            count: questionCount,
          }),
        }),
      );

      const selectedTitles = notes
        .filter((note) => selectedNoteIds.includes(note.id))
        .map((note) => note.title);
      setDraftQuestions(payload.questions);
      setDraftQuestionIndex(0);
      setDraftTitle(
        selectedTitles.length === 1
          ? `${selectedTitles[0]} quiz`
          : "Generated note quiz",
      );
      setView("preview");
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Quiz generation failed",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function updateDraftQuestion(index: number, update: Partial<QuizQuestion>) {
    setDraftQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              ...update,
            }
          : question,
      ),
    );
  }

  function updateDraftChoice(
    questionIndex: number,
    choiceIndex: number,
    value: string,
  ) {
    setDraftQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) {
          return question;
        }

        const choices = [...(question.choices ?? [])];
        choices[choiceIndex] = value;
        return { ...question, choices };
      }),
    );
  }

  function updateDraftQuestionType(index: number, type: QuizQuestionType) {
    setDraftQuestions((current) =>
      current.map((question, questionIndex) => {
        if (questionIndex !== index) {
          return question;
        }

        return {
          ...question,
          type,
          choices:
            type === "multiple_choice"
              ? (question.choices ?? ["", "", "", ""])
              : type === "true_false"
                ? ["True", "False"]
                : undefined,
        };
      }),
    );
  }

  function removeDraftQuestion(index: number) {
    setDraftQuestions((current) =>
      current.filter((_, questionIndex) => questionIndex !== index),
    );
    setDraftQuestionIndex((current) =>
      Math.max(0, Math.min(current, draftQuestions.length - 2)),
    );
  }

  function addDraftQuestion() {
    const selectedTitles = notes
      .filter((note) => selectedNoteIds.includes(note.id))
      .map((note) => note.title);
    setDraftQuestions((current) => [
      ...current,
      makeDraftQuestion(selectedTitles),
    ]);
    setDraftQuestionIndex(draftQuestions.length);
  }

  async function saveDraftQuiz() {
    if (draftQuestions.length === 0 || !draftTitle.trim()) {
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const sourceNoteTitles = getSourceTitles(
        draftQuestions,
        notes,
        selectedNoteIds,
      );
      const payload = await readJsonResponse<{ quiz: SavedQuiz }>(
        await fetch(
          editingQuizId ? `/api/quizzes/${editingQuizId}` : "/api/quizzes",
          {
            method: editingQuizId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: draftTitle,
              sourceNoteIds: selectedNoteIds,
              sourceNoteTitles,
              questions: draftQuestions,
              difficulty,
              mode,
              questionTypes,
              timeLimitMinutes: mode === "exam" ? timeMinutes : null,
            }),
          },
        ),
      );

      setQuizzes((current) =>
        editingQuizId
          ? current.map((quiz) =>
              quiz.id === payload.quiz.id ? payload.quiz : quiz,
            )
          : [payload.quiz, ...current],
      );
      setActiveQuizId(payload.quiz.id);
      setView("library");
      setEditingQuizId(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Quiz save failed",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function duplicateQuiz(quiz: SavedQuiz) {
    setError(null);
    setIsSaving(true);
    try {
      const copy = createQuizCopy(quiz);
      const payload = await readJsonResponse<{ quiz: SavedQuiz }>(
        await fetch("/api/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(copy),
        }),
      );

      setQuizzes((current) => [payload.quiz, ...current]);
      setActiveQuizId(payload.quiz.id);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Quiz duplicate failed",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function editQuiz(quiz: SavedQuiz) {
    setSelectedNoteIds(quiz.sourceNoteIds);
    setMode(quiz.mode);
    setTimeMinutes(quiz.timeLimitMinutes ?? 20);
    setQuestionCount(quiz.questionCount);
    setQuestionTypes(quiz.questionTypes);
    setDifficulty(quiz.difficulty);
    setDraftTitle(quiz.title);
    setDraftQuestions(quiz.questions);
    setDraftQuestionIndex(0);
    setEditingQuizId(quiz.id);
    setView("preview");
    setError(null);
  }

  async function deleteQuiz(quizId: string) {
    setError(null);
    setIsSaving(true);
    try {
      await readJsonResponse<{ success: true }>(
        await fetch(`/api/quizzes/${quizId}`, {
          method: "DELETE",
        }),
      );

      setQuizzes((current) => current.filter((quiz) => quiz.id !== quizId));
      setAttempts((current) =>
        current.filter((attempt) => attempt.quizId !== quizId),
      );
      setDeleteQuizId(null);
      if (activeQuizId === quizId) {
        setActiveQuizId(quizzes.find((quiz) => quiz.id !== quizId)?.id ?? "");
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Quiz delete failed",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function startTaking(quiz: SavedQuiz) {
    setActiveQuizId(quiz.id);
    setAnswers({});
    setCurrentIndex(0);
    setRemainingSeconds((quiz.timeLimitMinutes ?? 0) * 60);
    setStartedAt(Date.now());
    setLatestAttempt(null);
    setSelectedAttemptId("");
    setView("take");
    setError(null);
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        questionId,
        answer: value,
        evaluation: current[questionId]?.evaluation,
      },
    }));
  }

  async function evaluateQuestion(
    question: QuizQuestion,
    answer: string,
  ): Promise<QuizEvaluation> {
    const objective = gradeObjectiveAnswer(question, answer);
    if (objective) {
      return objective;
    }

    const payload = await readJsonResponse<{ evaluation: QuizEvaluation }>(
      await fetch("/api/quizzes/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      }),
    );

    return payload.evaluation;
  }

  async function checkCurrentAnswer() {
    if (!currentQuestion || !currentAnswer.trim()) {
      return;
    }

    setError(null);
    setIsEvaluating(true);
    try {
      const evaluation = await evaluateQuestion(currentQuestion, currentAnswer);
      setAnswers((current) => ({
        ...current,
        [currentQuestion.id]: {
          questionId: currentQuestion.id,
          answer: currentAnswer,
          evaluation,
        },
      }));
    } catch (evaluationError) {
      setError(
        evaluationError instanceof Error
          ? evaluationError.message
          : "Answer evaluation failed",
      );
    } finally {
      setIsEvaluating(false);
    }
  }

  async function finishAttempt() {
    if (!activeQuiz || isFinishing) {
      return;
    }

    setError(null);
    setIsFinishing(true);
    try {
      const completedAnswers: QuizAttemptAnswer[] = [];
      for (const question of activeQuiz.questions) {
        const answer = answers[question.id];
        if (!answer?.answer.trim()) {
          completedAnswers.push({
            questionId: question.id,
            answer: "",
            evaluation: createUnansweredEvaluation(question),
          });
          continue;
        }

        if (answer.evaluation) {
          completedAnswers.push(answer);
          continue;
        }

        try {
          completedAnswers.push({
            ...answer,
            evaluation: await evaluateQuestion(question, answer.answer),
          });
        } catch {
          completedAnswers.push({
            ...answer,
            evaluation: {
              correct: false,
              score: 0,
              feedback: "This answer could not be evaluated automatically.",
              idealAnswer: question.correctAnswer,
            },
          });
        }
      }

      const summary = summarizeAttempt(activeQuiz.questions, completedAnswers);
      const timeSpentSeconds = startedAt
        ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
        : null;
      const payload = await readJsonResponse<{ attempt: QuizAttempt }>(
        await fetch(`/api/quizzes/${activeQuiz.id}/attempts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...summary,
            timeSpentSeconds,
            mode: activeQuiz.mode,
          }),
        }),
      );

      setAnswers(
        Object.fromEntries(
          summary.answers.map((answer) => [answer.questionId, answer]),
        ),
      );
      setAttempts((current) => [payload.attempt, ...current]);
      setLatestAttempt(payload.attempt);
      setSelectedAttemptId(payload.attempt.id);
      setView("results");
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Quiz finish failed",
      );
    } finally {
      setIsFinishing(false);
    }
  }

  function renderLibrary() {
    const totalQuestions = quizzes.reduce(
      (sum, quiz) => sum + quiz.questionCount,
      0,
    );

    return (
      <section className="flex h-full min-h-0 flex-col gap-5">
        <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap gap-2">
            <StatPill>{quizzes.length} quizzes</StatPill>
            <StatPill>{totalQuestions} questions</StatPill>
          </div>
          <Button
            type="button"
            leadingIcon={<Plus className="size-4" />}
            onClick={openCreate}
          >
            Create quiz
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface/70">
        {quizzes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="flex max-w-sm flex-col items-center text-center">
              <FileQuestion className="mb-5 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">
                No saved quizzes
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Saved quizzes appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full auto-rows-min grid-cols-1 content-start items-start gap-4 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => {
              const lastAttempt = attempts.find((a) => a.quizId === quiz.id);
              const isDeleting = deleteQuizId === quiz.id;
              const isMenuOpen = moreOpenId === quiz.id;

              return (
                <div
                  key={quiz.id}
                  role="button"
                  tabIndex={0}
                  className={cx(
                    "relative cursor-pointer rounded-[var(--radius-xl)] border bg-card text-card-foreground shadow-[var(--shadow-card)] transition hover:border-border-strong hover:bg-surface-muted",
                    activeQuiz?.id === quiz.id ? "border-accent/70" : "border-border",
                  )}
                  onClick={() => startTaking(quiz)}
                  onKeyDown={(e) => e.key === "Enter" && startTaking(quiz)}
                >
                  <div className="flex items-start gap-3 p-5">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="accent">{quiz.mode}</Badge>
                        <Badge variant="outline">{quiz.difficulty}</Badge>
                        <Badge variant="outline">
                          {quiz.questionCount} questions
                        </Badge>
                        {lastAttempt ? (
                          <Badge variant="neutral">
                            {formatPercent(lastAttempt.score)} last
                          </Badge>
                        ) : null}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {quiz.title}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Updated {formatDate(quiz.updatedAt)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoreOpenId(isMenuOpen ? null : quiz.id);
                      }}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </div>

                  {isMenuOpen ? (
                    <>
                      <div
                        className="fixed inset-0 z-[49]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoreOpenId(null);
                        }}
                      />
                      <div className="absolute right-2 top-11 z-[50] min-w-[148px] overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-[var(--shadow-card)]">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            editQuiz(quiz);
                            setMoreOpenId(null);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            void duplicateQuiz(quiz);
                            setMoreOpenId(null);
                          }}
                        >
                          <Copy className="size-3.5" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteQuizId(quiz.id);
                            setMoreOpenId(null);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </div>
                    </>
                  ) : null}

                  {isDeleting ? (
                    <div
                      className="border-t border-border px-5 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-danger">
                        <span>Delete quiz and saved attempts?</span>
                        <span className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isSaving}
                            onClick={() => void deleteQuiz(quiz.id)}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteQuizId(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </section>
    );
  }

  function renderCreate() {
    return (
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl">Create Quiz</CardTitle>
            <CardDescription>
              Choose note context and quiz settings.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <StepPill active>Context</StepPill>
            <StepPill>Preview</StepPill>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pb-5">
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Notes</h2>
              <Badge variant="outline" className="text-sm">
                {selectedNoteIds.length} selected
              </Badge>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
              {notes.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted-foreground">
                  Create or upload notes first.
                </p>
              ) : (
                notes.map((note) => (
                  <label
                    key={note.id}
                    className={cx(
                      "flex min-h-20 cursor-pointer items-start gap-4 rounded-lg border border-border bg-surface px-4 py-4 text-sm transition",
                      note.hasEmbedding
                        ? "hover:border-border-strong hover:bg-surface-muted"
                        : "cursor-not-allowed opacity-60",
                      selectedNoteIds.includes(note.id)
                        ? "border-accent bg-accent-soft/60"
                        : "",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--accent)]"
                      checked={selectedNoteIds.includes(note.id)}
                      disabled={!note.hasEmbedding || isGenerating}
                      onChange={() => toggleNote(note.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {note.title}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {note.hasEmbedding
                          ? "Embedding ready"
                          : "Embedding required"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="grid shrink-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">
                Question types
              </h2>
              <div className="grid gap-2 md:grid-cols-3">
                {questionTypeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition hover:bg-surface-muted",
                      questionTypes.includes(option.value)
                        ? "border-accent bg-accent-soft/60 text-accent"
                        : "",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={questionTypes.includes(option.value)}
                      onChange={() => toggleQuestionType(option.value)}
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cx(
                      "rounded-lg border px-3 py-2 text-left text-sm transition",
                      mode === option.value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface hover:bg-surface-muted",
                    )}
                    onClick={() => setMode(option.value)}
                  >
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <label className="space-y-2 text-sm font-medium text-foreground">
                Difficulty
                <Select
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as QuizDifficulty)
                  }
                >
                  {difficultyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                Questions
                <Input
                  min={1}
                  max={25}
                  type="number"
                  value={questionCount}
                  onChange={(event) =>
                    setQuestionCount(Number(event.target.value))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                Time limit
                <Input
                  min={1}
                  max={240}
                  type="number"
                  disabled={mode !== "exam"}
                  value={timeMinutes}
                  onChange={(event) =>
                    setTimeMinutes(Number(event.target.value))
                  }
                />
              </label>
            </div>
          </section>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canGenerate}
              leadingIcon={
                isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )
              }
              onClick={() => void generatePreview()}
            >
              Generate preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openLibrary()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderPreview() {
    return (
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl">Preview Quiz</CardTitle>
            <CardDescription>Edit before saving.</CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <StepPill>Context</StepPill>
            <StepPill active>Preview</StepPill>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pb-5">
          <section className="grid shrink-0 gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_140px]">
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              Quiz name
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              Mode
              <Select
                value={mode}
                onChange={(event) => setMode(event.target.value as QuizMode)}
              >
                {modeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              Difficulty
              <Select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as QuizDifficulty)
                }
              >
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              Time
              <Input
                min={1}
                max={240}
                type="number"
                disabled={mode !== "exam"}
                value={timeMinutes}
                onChange={(event) => setTimeMinutes(Number(event.target.value))}
              />
            </label>
          </section>

          <section className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-border bg-surface-muted/60">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Questions
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Add question"
                  leadingIcon={<Plus className="size-4" />}
                  onClick={addDraftQuestion}
                >
                  Add
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {draftQuestions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                    <FileQuestion className="mx-auto mb-2 size-7 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      No questions
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add or generate from context.
                    </p>
                  </div>
                ) : (
                  draftQuestions.map((question, index) => (
                    <button
                      key={question.id}
                      type="button"
                      className={cx(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                        draftQuestionIndex === index
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-surface hover:bg-surface-muted",
                      )}
                      onClick={() => setDraftQuestionIndex(index)}
                    >
                      <span className="block font-semibold">
                        Question {index + 1}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {question.prompt || question.type.replace("_", " ")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            {activeDraftQuestion ? (
              <div className="overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-surface-muted/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">
                    Question {draftQuestionIndex + 1}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Trash2 className="size-4" />}
                    onClick={() => removeDraftQuestion(draftQuestionIndex)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                      Prompt
                      <Textarea
                        rows={7}
                        value={activeDraftQuestion.prompt}
                        className="resize-none"
                        onChange={(event) =>
                          updateDraftQuestion(draftQuestionIndex, {
                            prompt: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        Type
                        <Select
                          value={activeDraftQuestion.type}
                          onChange={(event) =>
                            updateDraftQuestionType(
                              draftQuestionIndex,
                              event.target.value as QuizQuestionType,
                            )
                          }
                        >
                          {questionTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-foreground">
                        Source metadata
                        <Input
                          value={activeDraftQuestion.sourceNoteTitles.join(
                            ", ",
                          )}
                          onChange={(event) =>
                            updateDraftQuestion(draftQuestionIndex, {
                              sourceNoteTitles: event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                      Correct answer
                      <Textarea
                        rows={7}
                        value={activeDraftQuestion.correctAnswer}
                        className="resize-none"
                        onChange={(event) =>
                          updateDraftQuestion(draftQuestionIndex, {
                            correctAnswer: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                      Explanation
                      <Textarea
                        rows={3}
                        value={activeDraftQuestion.explanation}
                        className="resize-none"
                        onChange={(event) =>
                          updateDraftQuestion(draftQuestionIndex, {
                            explanation: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                {activeDraftQuestion.type === "multiple_choice" &&
                activeDraftQuestion.choices?.length ? (
                  <div className="mt-3 grid shrink-0 gap-2 md:grid-cols-4">
                    {activeDraftQuestion.choices.map((choice, choiceIndex) => (
                      <label
                        key={`${activeDraftQuestion.id}-${choiceIndex}`}
                        className="space-y-1.5 text-sm font-medium text-foreground"
                      >
                        Choice {choiceIndex + 1}
                        <Input
                          value={choice}
                          onChange={(event) =>
                            updateDraftChoice(
                              draftQuestionIndex,
                              choiceIndex,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface-muted">
                <div className="text-center">
                  <FileQuestion className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <p className="font-semibold text-foreground">
                    No questions in preview
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a question or go back to generate from context.
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                draftQuestions.length === 0 || !draftTitle.trim() || isSaving
              }
              leadingIcon={
                isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )
              }
              onClick={() => void saveDraftQuiz()}
            >
              Save quiz
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setView(editingQuizId ? "library" : "create")}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => openLibrary(activeQuizId)}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderTake() {
    if (!activeQuiz || !currentQuestion) {
      return null;
    }

    return (
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{activeQuiz.title}</CardTitle>
            <CardDescription>
              Question {currentIndex + 1} of {activeQuiz.questions.length}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="accent">{activeQuiz.mode}</Badge>
            {activeQuiz.mode === "exam" ? (
              <Badge variant={examExpired ? "neutral" : "accent"}>
                <Clock className="size-3.5" />
                {formatTimer(remainingSeconds)}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pb-5">
          {examExpired ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-danger dark:border-red-950/70">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Time expired. Finish quiz to save results.
            </div>
          ) : null}
          <div className="h-2 shrink-0 rounded-full bg-surface-muted">
            <div
              className="h-2 rounded-full bg-accent transition-all"
              style={{
                width: `${((currentIndex + 1) / activeQuiz.questions.length) * 100}%`,
              }}
            />
          </div>
          <div className="min-h-0 shrink overflow-y-auto rounded-lg border border-border bg-surface-muted p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {currentQuestion.type.replace("_", " ")}
              </Badge>
              {currentQuestion.sourceNoteTitles.map((title) => (
                <Badge key={title} variant="neutral">
                  {title}
                </Badge>
              ))}
            </div>
            <MarkdownText
              markdown={currentQuestion.prompt}
              className="space-y-3 text-xl font-semibold leading-8"
            />
          </div>
          {currentQuestion.type === "multiple_choice" ||
          currentQuestion.type === "true_false" ? (
            <div className="grid shrink-0 gap-2">
              {(currentQuestion.choices ?? []).map((choice) => (
                <label
                  key={choice}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm transition hover:bg-surface-muted",
                    currentAnswer === choice
                      ? "border-accent bg-accent-soft text-accent"
                      : "text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={currentQuestion.id}
                    className="size-4 accent-[var(--accent)]"
                    checked={currentAnswer === choice}
                    disabled={
                      Boolean(currentEvaluation) || examExpired || isFinishing
                    }
                    onChange={() => updateAnswer(currentQuestion.id, choice)}
                  />
                  <MarkdownText markdown={choice} className="text-sm" />
                </label>
              ))}
            </div>
          ) : (
            <Textarea
              value={currentAnswer}
              disabled={
                Boolean(currentEvaluation) || examExpired || isFinishing
              }
              placeholder="Type your answer..."
              rows={7}
              className="min-h-0 flex-1 resize-none"
              onChange={(event) =>
                updateAnswer(currentQuestion.id, event.target.value)
              }
            />
          )}
          {currentEvaluation && activeQuiz.mode === "practice" ? (
            <div
              className={cx(
                "rounded-lg border px-4 py-3 text-sm leading-6",
                currentEvaluation.correct
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-950/70 dark:bg-green-950/20 dark:text-green-200"
                  : "border-red-200 bg-danger-soft text-danger dark:border-red-950/70",
              )}
            >
              <div className="font-medium">
                {currentEvaluation.correct ? "Correct" : "Needs work"} - Score{" "}
                {formatPercent(currentEvaluation.score)}
              </div>
              <MarkdownText
                markdown={currentEvaluation.feedback}
                className="mt-1 space-y-2"
              />
              <div className="mt-2 font-medium">Ideal answer</div>
              <MarkdownText
                markdown={currentEvaluation.idealAnswer}
                className="mt-1 space-y-2"
              />
            </div>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={currentIndex === 0 || isFinishing}
                onClick={() =>
                  setCurrentIndex((index) => Math.max(0, index - 1))
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  currentIndex >= activeQuiz.questions.length - 1 || isFinishing
                }
                onClick={() =>
                  setCurrentIndex((index) =>
                    Math.min(activeQuiz.questions.length - 1, index + 1),
                  )
                }
              >
                Next
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeQuiz.mode === "practice" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !currentAnswer.trim() ||
                    Boolean(currentEvaluation) ||
                    isEvaluating ||
                    isFinishing
                  }
                  leadingIcon={
                    isEvaluating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )
                  }
                  onClick={() => void checkCurrentAnswer()}
                >
                  Check answer
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={isFinishing}
                onClick={() => openLibrary(activeQuiz.id)}
              >
                Exit
              </Button>
              <Button
                type="button"
                disabled={isFinishing}
                leadingIcon={
                  isFinishing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : undefined
                }
                onClick={() => void finishAttempt()}
              >
                Finish quiz
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderResults() {
    if (!activeQuiz || !selectedAttempt) {
      return null;
    }

    const byQuestionId = new Map(
      selectedAttempt.answers.map((answer) => [answer.questionId, answer]),
    );
    const resultQuestionIndex = Math.min(
      currentIndex,
      activeQuiz.questions.length - 1,
    );
    const resultQuestion = activeQuiz.questions[resultQuestionIndex];
    const resultAnswer = resultQuestion
      ? byQuestionId.get(resultQuestion.id)
      : undefined;
    const resultEvaluation = resultQuestion
      ? (resultAnswer?.evaluation ?? createUnansweredEvaluation(resultQuestion))
      : null;

    return (
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 py-5">
            <CardTitle>Results</CardTitle>
            <CardDescription>{activeQuiz.title}</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pb-5">
            <div className="rounded-lg border border-border bg-surface-muted p-4">
              <div className="text-3xl font-semibold text-foreground">
                {formatPercent(selectedAttempt.score)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedAttempt.correctCount}/{selectedAttempt.questionCount}{" "}
                correct, {selectedAttempt.answeredCount} answered.
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Completed {formatDate(selectedAttempt.completedAt)}</p>
              {selectedAttempt.timeSpentSeconds !== null ? (
                <p>
                  Time spent {formatTimer(selectedAttempt.timeSpentSeconds)}
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {activeQuiz.questions.map((question, index) => {
                const answer = byQuestionId.get(question.id);
                const evaluation =
                  answer?.evaluation ?? createUnansweredEvaluation(question);
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={cx(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                      resultQuestionIndex === index
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface hover:bg-surface-muted",
                    )}
                    onClick={() => setCurrentIndex(index)}
                  >
                    <span>Question {index + 1}</span>
                    {evaluation.correct ? (
                      <CheckCircle2 className="size-4 text-accent" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                leadingIcon={<RotateCcw className="size-4" />}
                onClick={() => startTaking(activeQuiz)}
              >
                Retake
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => openLibrary(activeQuiz.id)}
              >
                Back to detail
              </Button>
            </div>
          </CardContent>
        </Card>

        {resultQuestion && resultEvaluation ? (
          <Card
            className={cx(
              "flex min-h-0 flex-col",
              resultEvaluation.correct
                ? "border-green-200 dark:border-green-950/70"
                : "border-red-200 dark:border-red-950/70",
            )}
          >
            <CardHeader className="shrink-0 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  Question {resultQuestionIndex + 1}
                </Badge>
                {resultEvaluation.correct ? (
                  <Badge variant="accent">
                    <CheckCircle2 className="size-3.5" />
                    Correct
                  </Badge>
                ) : (
                  <Badge variant="neutral">
                    <XCircle className="size-3.5" />
                    Missed
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base">Review</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 text-sm">
              <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface-muted p-3">
                <MarkdownText
                  markdown={resultQuestion.prompt}
                  className="space-y-2 font-medium"
                />
              </div>
              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
                <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface-muted p-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Your answer
                  </div>
                  <MarkdownText
                    markdown={resultAnswer?.answer.trim() || "Unanswered"}
                    className="space-y-2"
                  />
                </div>
                <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-surface-muted p-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Correct answer
                  </div>
                  <MarkdownText
                    markdown={resultQuestion.correctAnswer}
                    className="space-y-2"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-3">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Feedback
                </div>
                <MarkdownText
                  markdown={resultEvaluation.feedback}
                  className="space-y-2"
                />
                <div className="mt-3 mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Explanation
                </div>
                <MarkdownText
                  markdown={
                    resultQuestion.explanation || resultEvaluation.idealAnswer
                  }
                  className="space-y-2"
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <main
      data-testid="quizzes-one-page"
      className="mx-auto flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden px-4 py-5 sm:px-6 lg:px-8"
    >
      {error ? (
        <div className="shrink-0 rounded-lg border border-red-200 bg-danger-soft px-4 py-2 text-sm text-danger dark:border-red-950/70">
          {error}
        </div>
      ) : null}

      {view !== "library" ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openLibrary(activeQuizId)}
          >
            My Quizzes
          </Button>
          {view === "take" && activeQuiz ? (
            <Badge variant="outline">Focus mode</Badge>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "library" ? renderLibrary() : null}
        {view === "create" ? renderCreate() : null}
        {view === "preview" ? renderPreview() : null}
        {view === "take" ? renderTake() : null}
        {view === "results" ? renderResults() : null}
      </div>
    </main>
  );
}
