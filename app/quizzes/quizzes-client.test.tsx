import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizzesClient } from "@/app/quizzes/quizzes-client";
import type { QuizQuestion } from "@/lib/quizzes/gemini";
import type { SavedQuiz } from "@/lib/quizzes/types";

const notes = [
  {
    id: "note-ready",
    title: "Ready note",
    updatedAt: "2026-05-29T18:00:00.000Z",
    hasEmbedding: true,
  },
  {
    id: "note-missing",
    title: "Missing embedding note",
    updatedAt: "2026-05-29T18:00:00.000Z",
    hasEmbedding: false,
  },
];

const question: QuizQuestion = {
  id: "question-1",
  type: "free_response",
  prompt: "Explain loop invariants.",
  correctAnswer: "A loop invariant is true before and after each iteration.",
  explanation: "Invariants prove loop correctness.",
  sourceNoteTitles: ["Ready note"],
};

const savedQuiz: SavedQuiz = {
  id: "quiz-1",
  title: "Loop quiz",
  sourceNoteIds: ["note-ready"],
  sourceNoteTitles: ["Ready note"],
  questions: [question],
  questionCount: 1,
  difficulty: "medium",
  mode: "practice",
  questionTypes: ["free_response"],
  timeLimitMinutes: null,
  createdAt: "2026-05-29T18:00:00.000Z",
  updatedAt: "2026-05-29T18:00:00.000Z",
};

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return {
    ok: init?.status ? init.status < 400 : true,
    status: init?.status ?? 200,
    json: async () => payload,
  } as Response;
}

describe("QuizzesClient", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders library as quiz dashboard with stats and empty state", () => {
    render(<QuizzesClient notes={notes} initialQuizzes={[]} initialAttempts={[]} />);

    expect(screen.getByTestId("quizzes-one-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByText("0 quizzes")).toBeInTheDocument();
    expect(screen.getByText("0 questions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create quiz/i })).toBeInTheDocument();
    expect(screen.getByText("No saved quizzes")).toBeInTheDocument();
    expect(screen.getByText("Saved quizzes appear here.")).toBeInTheDocument();
  });

  it("uses a context-first creation screen with selectable embedding-ready notes", async () => {
    const user = userEvent.setup();
    render(<QuizzesClient notes={notes} initialQuizzes={[]} initialAttempts={[]} />);

    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    expect(screen.getByRole("heading", { name: "Create Quiz" })).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Ready note/i));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByLabelText(/Missing embedding note/i)).toBeDisabled();
  });

  it("keeps generated questions editable in preview and supports manual additions", async () => {
    const user = userEvent.setup();
    render(<QuizzesClient notes={notes} initialQuizzes={[savedQuiz]} initialAttempts={[]} />);

    await user.click(screen.getByRole("button", { name: /Open actions for Loop quiz/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("heading", { name: "Preview Quiz" })).toBeInTheDocument();
    expect(screen.getByLabelText(/quiz name/i)).toHaveValue("Loop quiz");
    expect(screen.getAllByLabelText("Prompt")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /add question/i }));

    expect(screen.getAllByLabelText("Prompt")).toHaveLength(1);
    expect(screen.getAllByText("Question 2").length).toBeGreaterThan(0);
  });

  it("normalizes edited quiz math to LaTeX before saving", async () => {
    const user = userEvent.setup();
    const normalizedQuiz: SavedQuiz = {
      ...savedQuiz,
      questions: [
        {
          ...question,
          prompt: "Area $\\pi r^2$",
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ quiz: normalizedQuiz })));

    render(<QuizzesClient notes={notes} initialQuizzes={[savedQuiz]} initialAttempts={[]} />);

    await user.click(screen.getByRole("button", { name: /Open actions for Loop quiz/ }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Prompt"));
    await user.type(screen.getByLabelText("Prompt"), "Area $πr²$");
    await user.click(screen.getByRole("button", { name: /save quiz/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      questions: [
        {
          prompt: "Area $\\pi r^2$",
        },
      ],
    });
  });
});
