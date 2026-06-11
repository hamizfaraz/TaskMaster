import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { FlashcardContextNote, FlashcardItem } from "@/lib/flashcards/types";

const generatedCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  sourceNoteTitles: z.array(z.string().min(1)).default([]),
});

const generatedDeckSchema = z.object({
  title: z.string().min(1),
  cards: z.array(generatedCardSchema).min(1),
});

export type GeneratedFlashcardDeck = {
  title: string;
  cards: FlashcardItem[];
};

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

function summarizeEmbedding(values: number[]) {
  return values.map((value) => Number(value.toFixed(6)));
}

function createContextPrompt(notes: FlashcardContextNote[]) {
  return notes
    .map((note, index) =>
      [
        `NOTE ${index + 1}: ${note.title}`,
        `Stored embedding vector (${note.embedding.length} dimensions):`,
        JSON.stringify(summarizeEmbedding(note.embedding)),
        "Markdown content:",
        note.markdown || "(No readable note body was stored for this note.)",
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

function createCardId() {
  return crypto.randomUUID();
}

export async function generateFlashcardDeck(params: {
  notes: FlashcardContextNote[];
  cardCount: number;
}): Promise<GeneratedFlashcardDeck> {
  const ai = getGoogleAiClient();
  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_FLASHCARDS_MODEL", "GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Create a flashcard deck from the supplied notes.",
              "Use every selected note's stored embedding vector as semantic context, and use the note markdown as factual evidence.",
              "Focus on important points, definitions, equations, formulas, processes, comparisons, common mistakes, examples, and likely study targets.",
              "Each card must have a clear front prompt and a complete back answer.",
              "Prefer cards that require recall, not simple recognition. Keep cards atomic: one main fact, relationship, equation, or reasoning step per card.",
              "If the notes contain equations, preserve the relevant notation in Markdown/LaTeX.",
              `Generate exactly ${params.cardCount} cards.`,
              "Return JSON only with this shape: {\"title\":\"...\",\"cards\":[{\"front\":\"...\",\"back\":\"...\",\"sourceNoteTitles\":[\"...\"]}]}",
              "Selected notes:",
              createContextPrompt(params.notes),
            ].join("\n\n"),
          },
        ],
      },
    ],
    config: {
      temperature: 0.45,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                front: { type: "string" },
                back: { type: "string" },
                sourceNoteTitles: { type: "array", items: { type: "string" } },
              },
              required: ["front", "back", "sourceNoteTitles"],
            },
          },
        },
        required: ["title", "cards"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty flashcard generation response.");
  }

  let deck: z.infer<typeof generatedDeckSchema>;
  try {
    deck = generatedDeckSchema.parse(parseJsonPayload(response.text));
  } catch (parseError) {
    console.error("[flashcards/gemini] Deck parse failed:", parseError);
    throw new Error("Flashcard generation failed");
  }

  return {
    title: deck.title.trim() || "Generated flashcards",
    cards: deck.cards.map((card) => ({
      ...card,
      id: createCardId(),
      front: card.front.trim(),
      back: card.back.trim(),
    })),
  };
}
