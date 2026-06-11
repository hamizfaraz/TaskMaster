import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";

const AZURE_DOCUMENT_INTELLIGENCE_API_VERSION = "2024-11-30";
const EMBEDDING_DIMENSIONS = 768;
const MAX_GENERATED_TOPIC_NOTES = 4;
const TARGET_MARKDOWN_CHARS_PER_TOPIC_NOTE = 4500;

const markdownNoteSchema = z.object({
  markdown: z.string().min(1),
});

const topicSchema = z.object({
  title: z.string().min(1),
  markdown: z.string().min(1),
});

const topicsSchema = z.object({
  topics: z.array(topicSchema).min(1),
});

export type GeneratedTopicNote = {
  title: string;
  markdown: string;
  embedding: number[];
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

function normalizeAzureEndpoint(value: string) {
  return value.replace(/\/+$/, "");
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeDocumentWithAzure(fileBuffer: Buffer, mimeType: string) {
  const endpoint = normalizeAzureEndpoint(getRequiredEnv("AZURE_ENDPOINT", "AZURE_ENDPOINT"));
  const key = getRequiredEnv("AZURE_KEY");
  const model = encodeURIComponent(getRequiredEnv("AZURE_MODEL"));
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${model}:analyze?_overload=analyzeDocument&api-version=${AZURE_DOCUMENT_INTELLIGENCE_API_VERSION}`;

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    },
    body: JSON.stringify({
      base64Source: fileBuffer.toString("base64"),
    }),
  });

  if (!analyzeResponse.ok) {
    const details = await analyzeResponse.text().catch(() => "");
    throw new Error(`Azure Document Intelligence rejected the file (${analyzeResponse.status}). ${details}`);
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure Document Intelligence did not return an operation-location header.");
  }

  const retryAfter = Number(analyzeResponse.headers.get("retry-after") ?? 1);
  const pollDelayMs = Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1000;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(pollDelayMs);

    const pollResponse = await fetch(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
      },
    });

    if (!pollResponse.ok) {
      const details = await pollResponse.text().catch(() => "");
      throw new Error(`Azure Document Intelligence polling failed (${pollResponse.status}). ${details}`);
    }

    const payload = (await pollResponse.json()) as {
      status?: string;
      analyzeResult?: {
        content?: string;
      };
      error?: {
        message?: string;
      };
    };

    if (payload.status === "succeeded") {
      const parsedText = payload.analyzeResult?.content?.trim();
      if (!parsedText) {
        throw new Error(`Azure Document Intelligence parsed ${mimeType} but returned no text content.`);
      }

      return parsedText;
    }

    if (payload.status === "failed") {
      throw new Error(payload.error?.message || "Azure Document Intelligence failed to analyze the file.");
    }
  }

  throw new Error("Azure Document Intelligence timed out before returning parsed text.");
}

export async function rewriteParsedTextAsMarkdown(parsedText: string, fileName: string) {
  const ai = getGoogleAiClient();
  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Rewrite the parsed document text into clean Markdown notes.",
              "Prefer comprehensive class notes over a short summary.",
              "Do not add new facts, examples, interpretations, dates, names, conclusions, or context.",
              "Only reorganize, format, and lightly rewrite information that is present in the source text.",
              "Keep definitions, examples, steps, equations, code, diagrams, table contents, and important caveats when they appear in the source.",
              "Avoid collapsing several source details into one vague bullet. Dense notes are better than brief notes.",
              "Preserve uncertainty and omissions. If the source is unclear, keep it unclear.",
              "Convert all parsed math section into LaTeX math blocks. Do not attempt to interpret or rewrite math expressions.",
              "Convert all parsed tables into Markdown tables. Do not attempt to interpret or rewrite table contents.",
              "Convert all parsed lists into Markdown lists. Do not attempt to interpret or rewrite list contents.",
              "Convert all parsed images into Markdown image links with alt text. Do not attempt to interpret or rewrite image contents.",
              "Convert all code sections into Markdown code blocks. Do not attempt to interpret or rewrite code contents. Fix indentation and formatting if needed for valid Markdown, but do not change code syntax.",
              "If the source contains an explicit flowchart, state diagram, or Mermaid diagram, preserve it as a fenced Mermaid block using ```mermaid. Do not invent diagrams.",
              "Return JSON only with this shape: {\"markdown\":\"...\"}.",
              `File name: ${fileName}`,
              "Parsed text:",
              parsedText,
            ].join("\n\n"),
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
          markdown: { type: "string" },
        },
        required: ["markdown"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty Markdown rewrite.");
  }

  return markdownNoteSchema.parse(parseJsonPayload(response.text)).markdown.trim();
}

export async function splitMarkdownIntoTopics(markdown: string) {
  const ai = getGoogleAiClient();
  const response = await ai.models.generateContent({
    model: getRequiredEnv("GEMINI_PARSE_MODEL"),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Split these Markdown notes into large topic sections.",
              `Return between 1 and ${MAX_GENERATED_TOPIC_NOTES} topics unless the document is extremely large.`,
              "Prefer fewer, denser topics over many small notes.",
              "Each topic should usually contain multiple related sections, examples, and details rather than a single slide-sized idea.",
              "Each topic must contain only text copied or rewritten from the supplied Markdown notes.",
              "Preserve as much supplied detail as possible inside each topic. Do not make thin summaries.",
              "Do not introduce new facts. Do not summarize across missing context.",
              "A topic may be the entire note if the note covers one topic.",
              "Return JSON only with this shape: {\"topics\":[{\"title\":\"...\",\"markdown\":\"...\"}]}",
              "Markdown notes:",
              markdown,
            ].join("\n\n"),
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
          topics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                markdown: { type: "string" },
              },
              required: ["title", "markdown"],
            },
          },
        },
        required: ["topics"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty topic split.");
  }

  const topics = topicsSchema.parse(parseJsonPayload(response.text)).topics.map((topic) => ({
    title: topic.title.trim() || "Generated Topic",
    markdown: topic.markdown.trim(),
  }));

  return rebalanceGeneratedTopics(topics);
}

function formatTopicForMergedMarkdown(topic: { title: string; markdown: string }) {
  const markdown = topic.markdown.trim();
  if (/^#{1,6}\s/.test(markdown)) {
    return markdown;
  }

  return `## ${topic.title}\n\n${markdown}`;
}

export function rebalanceGeneratedTopics<T extends { title: string; markdown: string }>(
  topics: T[],
) {
  const normalizedTopics = topics
    .map((topic) => ({
      ...topic,
      title: topic.title.trim() || "Generated Topic",
      markdown: topic.markdown.trim(),
    }))
    .filter((topic) => topic.markdown.length > 0);

  if (normalizedTopics.length <= 1) {
    return normalizedTopics;
  }

  const totalMarkdownChars = normalizedTopics.reduce(
    (sum, topic) => sum + topic.markdown.length,
    0,
  );
  const targetTopicCount = Math.min(
    normalizedTopics.length,
    MAX_GENERATED_TOPIC_NOTES,
    Math.max(1, Math.ceil(totalMarkdownChars / TARGET_MARKDOWN_CHARS_PER_TOPIC_NOTE)),
  );

  if (normalizedTopics.length <= targetTopicCount) {
    return normalizedTopics;
  }

  const targetCharsPerGroup = Math.ceil(totalMarkdownChars / targetTopicCount);
  const groups: Array<typeof normalizedTopics> = [];
  let currentGroup: typeof normalizedTopics = [];
  let currentGroupChars = 0;

  normalizedTopics.forEach((topic, index) => {
    const remainingTopics = normalizedTopics.length - index;
    const remainingGroupsAfterCurrent = targetTopicCount - groups.length - 1;
    const mustKeepRoomForRemainingGroups = remainingTopics <= remainingGroupsAfterCurrent;
    const shouldStartNextGroup =
      currentGroup.length > 0 &&
      groups.length < targetTopicCount - 1 &&
      currentGroupChars + topic.markdown.length > targetCharsPerGroup &&
      !mustKeepRoomForRemainingGroups;

    if (shouldStartNextGroup) {
      groups.push(currentGroup);
      currentGroup = [];
      currentGroupChars = 0;
    }

    currentGroup.push(topic);
    currentGroupChars += topic.markdown.length;
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.map((group) => {
    if (group.length === 1) {
      return group[0];
    }

    const firstTitle = group[0].title;
    const lastTitle = group[group.length - 1].title;

    return {
      ...group[0],
      title: firstTitle === lastTitle ? firstTitle : `${firstTitle} + ${lastTitle}`,
      markdown: group.map(formatTopicForMergedMarkdown).join("\n\n"),
    };
  });
}

function l2Normalize(values: number[]) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Gemini returned an embedding vector with zero magnitude.");
  }

  return values.map((value) => value / magnitude);
}

export async function embedGeneratedTopics(topics: Array<{ title: string; markdown: string }>) {
  const ai = getGoogleAiClient();
  const response = await ai.models.embedContent({
    model: getRequiredEnv("GEMINI_EMBEDDINGS_MODEL"),
    contents: topics.map((topic) => `${topic.title}\n\n${topic.markdown}`),
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: "RETRIEVAL_DOCUMENT",
    },
  });

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== topics.length) {
    throw new Error("Gemini returned an unexpected number of embeddings.");
  }

  return topics.map((topic, index) => {
    const values = embeddings[index]?.values ?? [];
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Gemini returned a ${values.length}-dimensional embedding instead of ${EMBEDDING_DIMENSIONS}.`);
    }

    return {
      ...topic,
      embedding: l2Normalize(values),
    };
  });
}

export { parseMarkdownToNoteDocument as markdownToNoteDocument };

export async function generateTopicNotesFromFile(params: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const parsedText = await analyzeDocumentWithAzure(params.fileBuffer, params.mimeType);
  const markdown = await rewriteParsedTextAsMarkdown(parsedText, params.fileName);
  const topics = await splitMarkdownIntoTopics(markdown);
  const embeddedTopics = await embedGeneratedTopics(topics);

  return {
    parsedText,
    markdown,
    topics: embeddedTopics,
  };
}
