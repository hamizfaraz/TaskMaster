import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { NoteContext } from "@/lib/notes/context";

export const quizQuestionTypes = ["multiple_choice", "free_response", "true_false"] as const;
export const quizDifficulties = ["easy", "medium", "hard"] as const;

export type QuizQuestionType = (typeof quizQuestionTypes)[number];
export type QuizDifficulty = (typeof quizDifficulties)[number];

/** @deprecated Use `NoteContext` from `@/lib/notes/context`. */
export type QuizContextNote = NoteContext;

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices?: string[];
  correctAnswer: string;
  explanation: string;
  sourceNoteTitles: string[];
};

export type QuizEvaluation = {
  correct: boolean;
  score: number;
  feedback: string;
  idealAnswer: string;
};

const questionSchema = z.object({
  type: z.enum(quizQuestionTypes),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  sourceNoteTitles: z.array(z.string().min(1)).min(1),
});

const questionsSchema = z.object({
  questions: z.array(questionSchema).min(1),
});

const evaluationSchema = z.object({
  correct: z.boolean(),
  score: z.number().min(0).max(1),
  feedback: z.string().min(1),
  idealAnswer: z.string().min(1),
});

function getRequiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);

  if (!value) {
    throw new Error(
      fallbackName
        ? `${name} is missing. Add ${name} to your server environment.`
        : `${name} is missing. Add it to your server environment.`,
    );
  }

  return value;
}

function getGoogleAiClient() {
  return new GoogleGenAI({
    apiKey: getRequiredEnv("GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
  });
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fencedMatch?.[1] ?? trimmed) as unknown;
}

function createQuestionId() {
  return crypto.randomUUID();
}

function summarizeEmbedding(values: number[]) {
  return values.map((value) => Number(value.toFixed(6)));
}

function createContextPrompt(notes: QuizContextNote[]) {
  return notes
    .map((note, index) =>
      [
        `NOTE ${index + 1}: ${note.title}`,
        `Stored embedding vector (${note.embedding.length} dimensions):`,
        JSON.stringify(summarizeEmbedding(note.embedding)),
        note.highlights.length > 0
          ? `Student-highlighted passages (treat as the most important material in this note):\n${note.highlights.map((highlight) => `- ${highlight}`).join("\n")}`
          : "The student highlighted nothing in this note.",
        "Markdown content:",
        note.markdown || "(No readable note body was stored for this note.)",
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function normalizeQuestion(question: z.infer<typeof questionSchema>): QuizQuestion {
  return {
    ...question,
    id: createQuestionId(),
    choices:
      question.type === "multiple_choice"
        ? (question.choices ?? []).slice(0, 5)
        : question.type === "true_false"
          ? ["True", "False"]
          : undefined,
  };
}

export async function generateQuizQuestions(params: {
  notes: QuizContextNote[];
  difficulty: QuizDifficulty;
  questionTypes: QuizQuestionType[];
  count: number;
  previousPrompts?: string[];
}) {
  const ai = getGoogleAiClient();
  const questionTypes = params.questionTypes.join(", ");
  const previousPrompts = params.previousPrompts?.length
    ? `Avoid repeating or closely paraphrasing these previous prompts:\n${params.previousPrompts.join("\n")}`
    : "No previous prompts were provided.";

  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_QUIZ_MODEL", "GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Create study quiz questions from the supplied notes.",
              "Use every selected note's stored embedding vector as semantic context, and use the note markdown as factual evidence.",
              "Focus on important definitions, relationships, procedures, formulas, examples, edge cases, and likely exam points.",
              "When a note lists student-highlighted passages, cover every one of them before drawing on the surrounding prose: the student marked those as what matters most.",
              "If a note contains worked examples, create some questions in the same style or a nearby style while changing values, framing, or reasoning steps.",
              "Keep questions varied enough that each one remains challenging. Do not ask trivia about filenames or note metadata.",
              `Difficulty: ${params.difficulty}.`,
              `Allowed question types: ${questionTypes}.`,
              `Generate exactly ${params.count} question${params.count === 1 ? "" : "s"}.`,
              "For multiple choice, provide 4 plausible choices and one correct answer.",
              "For true/false, use only True or False as the correct answer.",
              "For free response, provide a concise ideal answer and explanation.",
              "Return JSON only with this shape: {\"questions\":[{\"type\":\"multiple_choice|free_response|true_false\",\"prompt\":\"...\",\"choices\":[\"...\"],\"correctAnswer\":\"...\",\"explanation\":\"...\",\"sourceNoteTitles\":[\"...\"]}]}",
              previousPrompts,
              "Selected notes:",
              createContextPrompt(params.notes),
            ].join("\n\n"),
          },
        ],
      },
    ],
    config: {
      temperature: params.difficulty === "easy" ? 0.35 : params.difficulty === "medium" ? 0.55 : 0.75,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                prompt: { type: "string" },
                choices: { type: "array", items: { type: "string" } },
                correctAnswer: { type: "string" },
                explanation: { type: "string" },
                sourceNoteTitles: { type: "array", items: { type: "string" } },
              },
              required: ["type", "prompt", "correctAnswer", "explanation", "sourceNoteTitles"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty quiz generation response.");
  }

  return questionsSchema.parse(parseJsonPayload(response.text)).questions.map(normalizeQuestion);
}

export async function evaluateQuizAnswer(params: {
  question: QuizQuestion;
  answer: string;
}) {
  const ai = getGoogleAiClient();
  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_QUIZ_MODEL", "GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Evaluate the student's quiz answer.",
              "Be strict about factual correctness, but accept equivalent wording for free response answers.",
              "For multiple choice and true/false, mark the answer correct only when it matches the correct answer.",
              "Return JSON only with this shape: {\"correct\":true,\"score\":1,\"feedback\":\"...\",\"idealAnswer\":\"...\"}.",
              `Question type: ${params.question.type}`,
              `Prompt: ${params.question.prompt}`,
              params.question.choices?.length ? `Choices: ${params.question.choices.join(" | ")}` : "",
              `Correct answer: ${params.question.correctAnswer}`,
              `Explanation/rubric: ${params.question.explanation}`,
              `Student answer: ${params.answer}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          correct: { type: "boolean" },
          score: { type: "number" },
          feedback: { type: "string" },
          idealAnswer: { type: "string" },
        },
        required: ["correct", "score", "feedback", "idealAnswer"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty answer evaluation response.");
  }

  return evaluationSchema.parse(parseJsonPayload(response.text));
}
