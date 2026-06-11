import type { QuizQuestion } from "@/lib/quizzes/gemini";
import type { QuizAttemptAnswer, QuizEvaluation } from "@/lib/quizzes/types";

const unansweredEvaluation: QuizEvaluation = {
  correct: false,
  score: 0,
  feedback: "No answer was submitted.",
  idealAnswer: "",
};

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function gradeObjectiveAnswer(question: QuizQuestion, answer: string): QuizEvaluation | null {
  if (question.type === "free_response") {
    return null;
  }

  const correct = normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct ? "Correct." : "Incorrect.",
    idealAnswer: question.correctAnswer,
  };
}

export function createUnansweredEvaluation(question: QuizQuestion): QuizEvaluation {
  return {
    ...unansweredEvaluation,
    idealAnswer: question.correctAnswer,
  };
}

export function summarizeAttempt(questions: QuizQuestion[], answers: QuizAttemptAnswer[]) {
  const byQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const normalizedAnswers = questions.map((question) => {
    const answer = byQuestionId.get(question.id);
    if (!answer?.answer.trim()) {
      return {
        questionId: question.id,
        answer: "",
        evaluation: createUnansweredEvaluation(question),
      };
    }

    return {
      ...answer,
      evaluation: answer.evaluation ?? gradeObjectiveAnswer(question, answer.answer) ?? {
        correct: false,
        score: 0,
        feedback: "Free response needs review.",
        idealAnswer: question.correctAnswer,
      },
    };
  });

  const correctCount = normalizedAnswers.filter((answer) => answer.evaluation.correct).length;
  const answeredCount = normalizedAnswers.filter((answer) => answer.answer.trim()).length;

  return {
    answers: normalizedAnswers,
    score: questions.length === 0 ? 0 : correctCount / questions.length,
    correctCount,
    answeredCount,
    questionCount: questions.length,
  };
}
