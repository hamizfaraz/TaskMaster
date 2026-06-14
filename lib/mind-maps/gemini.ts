import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { MindMapContextNote } from "@/lib/mind-maps/context";

export type GeneratedAssociationMap = {
  topics: string[];
  connections: Array<{ source: string; target: string; label: string | null }>;
};

const generatedSchema = z.object({
  topics: z.array(z.object({ label: z.string().min(1) })).min(1),
  connections: z
    .array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        relationship: z.string().optional(),
      }),
    )
    .optional(),
});

function getRequiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`${name} is missing. Add it to your server environment.`);
  }
  return value;
}

function getGoogleAiClient() {
  return new GoogleGenAI({ apiKey: getRequiredEnv("GOOGLE_GENERATIVE_AI_API_KEY") });
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fencedMatch?.[1] ?? trimmed) as unknown;
}

function buildContextPrompt(notes: MindMapContextNote[]) {
  return notes
    .map((note, index) =>
      [`NOTE ${index + 1}: ${note.title}`, note.markdown || "(No readable note body was stored.)"].join(
        "\n",
      ),
    )
    .join("\n\n---\n\n");
}

/**
 * Reads the supplied notes and proposes an associations-style map: a set of key
 * topics and the labelled relationships between them. Topics/connections are de-
 * duplicated and connections are pruned to valid, distinct topic pairs.
 */
export async function generateAssociationMap(params: {
  notes: MindMapContextNote[];
}): Promise<GeneratedAssociationMap> {
  const ai = getGoogleAiClient();

  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_MINDMAP_MODEL", "GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Build an associations-style study mind map from the supplied notes.",
              "Identify between 6 and 12 of the most important concepts or topics worth remembering.",
              "Then describe how those topics relate to each other using short relationship labels such as 'causes', 'example of', 'contrasts with', 'depends on', 'part of', or 'leads to'.",
              "Only connect topics that have a meaningful relationship; aim for a connected map, not a fully connected one.",
              "Each connection's source and target MUST exactly match one of the topic labels you returned.",
              'Return JSON only with this shape: {"topics":[{"label":"..."}],"connections":[{"source":"...","target":"...","relationship":"..."}]}',
              "Selected notes:",
              buildContextPrompt(params.notes),
            ].join("\n\n"),
          },
        ],
      },
    ],
    config: {
      temperature: 0.5,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" } },
              required: ["label"],
            },
          },
          connections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string" },
                target: { type: "string" },
                relationship: { type: "string" },
              },
              required: ["source", "target"],
            },
          },
        },
        required: ["topics"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty mind-map generation response.");
  }

  const parsed = generatedSchema.parse(parseJsonPayload(response.text));

  // De-duplicate topics case-insensitively, preserving the first-seen label.
  const topicByKey = new Map<string, string>();
  for (const topic of parsed.topics) {
    const label = topic.label.trim();
    const key = label.toLowerCase();
    if (label && !topicByKey.has(key)) topicByKey.set(key, label);
  }
  const topics = Array.from(topicByKey.values());

  // Keep only connections whose endpoints are real, distinct topics; drop dupes.
  const seenPairs = new Set<string>();
  const connections: GeneratedAssociationMap["connections"] = [];
  for (const connection of parsed.connections ?? []) {
    const sourceKey = connection.source.trim().toLowerCase();
    const targetKey = connection.target.trim().toLowerCase();
    if (sourceKey === targetKey) continue;
    if (!topicByKey.has(sourceKey) || !topicByKey.has(targetKey)) continue;

    const pairKey = [sourceKey, targetKey].sort().join("::");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const relationship = connection.relationship?.trim();
    connections.push({
      source: topicByKey.get(sourceKey) as string,
      target: topicByKey.get(targetKey) as string,
      label: relationship ? relationship : null,
    });
  }

  return { topics, connections };
}
