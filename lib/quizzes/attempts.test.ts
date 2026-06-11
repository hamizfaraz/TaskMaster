import { describe, expect, it } from "vitest";
import { gradeObjectiveAnswer, summarizeAttempt } from "@/lib/quizzes/attempts";
import type { QuizQuestion } from "@/lib/quizzes/gemini";

const questions: QuizQuestion[] = [
  {
    id: "mc-1",
    type: "multiple_choice",
    prompt: "Which value is prime?",
    choices: ["4", "6", "7", "9"],
    correctAnswer: "7",
    explanation: "7 is divisible only by 1 and itself.",
    sourceNoteTitles: ["Number Theory"],
  },
  {
    id: "tf-1",
    type: "true_false",
    prompt: "A derivative can describe instantaneous rate of change.",
    choices: ["True", "False"],
    correctAnswer: "True",
    explanation: "That is the core interpretation of a derivative.",
    sourceNoteTitles: ["Calculus"],
  },
  {
    id: "fr-1",
    type: "free_response",
    prompt: "Define variance.",
    correctAnswer: "Average squared distance from the mean.",
    explanation: "Variance measures spread around the mean.",
    sourceNoteTitles: ["Statistics"],
  },
];

describe("quiz attempt grading helpers", () => {
  it("grades multiple choice and true/false answers without calling AI", () => {
    expect(gradeObjectiveAnswer(questions[0], "7")).toMatchObject({
      correct: true,
      score: 1,
      idealAnswer: "7",
    });
    expect(gradeObjectiveAnswer(questions[1], "false")).toMatchObject({
      correct: false,
      score: 0,
      idealAnswer: "True",
    });
  });

  it("leaves free response grading to evaluator", () => {
    expect(gradeObjectiveAnswer(questions[2], "spread around mean")).toBeNull();
  });

  it("summarizes completed, missed, and unanswered questions as results-review data", () => {
    const summary = summarizeAttempt(questions, [
      {
        questionId: "mc-1",
        answer: "7",
      },
      {
        questionId: "tf-1",
        answer: "False",
      },
    ]);

    expect(summary).toMatchObject({
      correctCount: 1,
      answeredCount: 2,
      questionCount: 3,
      score: 1 / 3,
    });
    expect(summary.answers).toHaveLength(3);
    expect(summary.answers[2]).toMatchObject({
      questionId: "fr-1",
      answer: "",
      evaluation: {
        correct: false,
        score: 0,
        idealAnswer: "Average squared distance from the mean.",
      },
    });
  });
});
