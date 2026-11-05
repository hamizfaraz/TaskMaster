import { FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  isRetryableProviderError,
  retryDelayMs,
} from "@/lib/provider-errors";
import { hasTimeFor, withDeadline } from "@/lib/notes/deadline";
import {
  GENERATION_BUDGET_MS,
  MAX_INLINE_DOCUMENT_BYTES,
  RETRY_WORK_MARGIN_MS,
} from "@/lib/notes/limits";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";
import { sanitizeStoredText } from "@/lib/notes/sanitize";

// Gemini's image input formats, plus PDF. Azure also accepted GIF; Gemini does
// not, so the upload route's allowlist dropped it and gained HEIC/HEIF, which
// is what phone cameras actually produce.
export const OCR_SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);
/**
 * Must match the `vector(768)` column in the schema. Both `gemini-embedding-2`
 * and the retired `gemini-embedding-001` serve this size, which is why moving
 * between them needed no migration — only the stored vectors had to go, because
 * two models' vectors do not share a space.
 */
const EMBEDDING_DIMENSIONS = 768;
const MAX_GENERATED_TOPIC_NOTES = 4;
const TARGET_MARKDOWN_CHARS_PER_TOPIC_NOTE = 4500;

// Select emphasis while the model already has the full note in context. Keep
// the same instructions in the rewrite and topic split so the final split
// cannot discard the highlights that the rewrite chose.
const GENERATED_HIGHLIGHT_INSTRUCTIONS = [
  "Identify and highlight the most important points and formulas for studying, relative to the rest of each note.",
  "Use ==highlighted text== for a small, selective set of central definitions, key results, essential conditions, and formulas; leave examples, routine steps, and most prose unhighlighted. Do not highlight whole paragraphs or every bullet.",
  "For a selected key formula, use ==$LaTeX$== on a single line, with the == markers outside the math delimiters. Preserve every mathematical symbol and condition; never put == inside LaTeX or code. Keep multiline derivations as display math with $$ on separate lines, and highlight the key result separately as a single-line inline formula only when that result is already present in the source.",
  "Where possible, include the formula's title, name, or a concise definition in the SAME highlight as the formula: ==Formula name or short definition: $LaTeX$==. Look in the surrounding sentence, preceding heading, and nearby definition for context explicitly tied to that formula. Prefer a short, self-contained label that explains what the formula describes, preserving essential conditions. When no reliable label is supplied, highlight the formula alone; do not invent a name or infer a definition. Preserve this label-formula pairing when splitting into topics, including for highlights already present in the supplied notes.",
  "Highlights must stay on a single line, outside headings, code fences, inline code, links, and table structure. Preserve existing highlights, avoid nested highlights, and do not invent facts or formulas to highlight.",
].join("\n\n");

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

/** How many times a single step will try before giving up. */
const MAX_PROVIDER_ATTEMPTS = 3;

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry one pipeline step through a transient provider failure.
 *
 * Wrapped per step rather than around the whole pipeline: a 503 on the topic
 * split should retry the split, not re-transcribe a document that already
 * succeeded. Generating notes is three sequential calls, so without this a blip
 * on the last one throws away the two that were already paid for — which is
 * exactly what happened while auditing the pipeline, twice in ten minutes.
 *
 * An exhausted daily quota is deliberately not retried; it will not clear, so
 * waiting only delays telling the user something they need to act on.
 */
export async function withProviderRetry<T>(step: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= MAX_PROVIDER_ATTEMPTS || !isRetryableProviderError(error)) {
        throw error;
      }
      const delay = retryDelayMs(error, attempt);
      // The run has a deadline, so a retry that cannot finish inside it is not
      // worth waiting for. Without this the four steps could each wait twice and
      // together outlast the route's maxDuration, and the platform would kill the
      // handler — turning an error the caller can read into nothing at all.
      if (!hasTimeFor(delay, RETRY_WORK_MARGIN_MS)) {
        console.warn(`[generation] ${step} failed and there is no time left to retry; giving up`);
        throw error;
      }
      console.warn(
        `[generation] ${step} failed with a transient provider error; retrying in ${Math.round(delay / 1000)}s (attempt ${attempt} of ${MAX_PROVIDER_ATTEMPTS - 1})`,
      );
      await wait(delay);
    }
  }
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fencedMatch?.[1] ?? trimmed) as unknown;
}

/**
 * Transcribe an uploaded document with Gemini.
 *
 * This replaced Azure Document Intelligence, which billed $1.50 per 1,000 pages
 * against roughly $0.0000258 per page here — Azure was 91% of an upload's cost.
 *
 * Extraction stays a separate call from the Markdown rewrite that follows it,
 * even though one call could do both. Azure's real value was that it could only
 * ever report characters it had actually seen, which gave the rewrite step a
 * factual floor. A generative model has no such floor, so the floor has to come
 * from the instructions: this prompt forbids interpretation and requires
 * illegible regions to be marked rather than guessed. Treat this as
 * transcription; all restructuring belongs to rewriteParsedTextAsMarkdown.
 */
export async function extractDocumentText(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
) {
  if (!OCR_SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Gemini cannot read ${mimeType}.`);
  }

  if (fileBuffer.byteLength > MAX_INLINE_DOCUMENT_BYTES) {
    throw new Error("The file is too large to send to Gemini inline.");
  }

  const ai = getGoogleAiClient();
  const response = await withProviderRetry("transcribe the document", () =>
    ai.models.generateContent({
      model: getRequiredEnv("GEMINI_OCR_MODEL", "GEMINI_PARSE_MODEL"),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Transcribe this document exactly as it appears. This is an optical character recognition task, not a writing task.",
                "Copy every word, number, and symbol in natural reading order. On a multi-column page, finish one column before starting the next.",
                "Do not summarize, explain, answer, correct, or comment on the content. Do not add headings, transitions, or any text that is not in the document.",
                "Write mathematics as LaTeX: $...$ inline and $$...$$ when displayed. Transcribe the symbols you see; do not solve, simplify, or rearrange them.",
                "Keep tables as rows and columns, lists as lists, and code verbatim including its indentation.",
                "Where the document is genuinely illegible, write [illegible] rather than guessing. An honest gap is more useful than an invented word.",
                "Record figures and diagrams as [figure: labels visible in the figure]. Do not interpret what they mean.",
                "Return the transcription as plain text, with no commentary and no code fence wrapping the whole response.",
                `File name: ${fileName}`,
              ].join("\n\n"),
            },
            {
              inlineData: {
                mimeType,
                data: fileBuffer.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
      },
    }),
  );

  // A document longer than the model's output limit comes back truncated with no
  // error. Accepting it would store half a document as though it were whole, and
  // nothing downstream could tell: the source file is not kept.
  if (response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
    throw new Error(
      `${fileName} is too long to transcribe in one pass. Split it into smaller documents.`,
    );
  }

  const parsedText = sanitizeStoredText(response.text ?? "").trim();
  if (!parsedText) {
    throw new Error(`Gemini read ${fileName} but returned no text content.`);
  }

  return parsedText;
}

export async function rewriteParsedTextAsMarkdown(parsedText: string, fileName: string) {
  const ai = getGoogleAiClient();
  const response = await withProviderRetry("rewrite as Markdown", () =>
    ai.models.generateContent({
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
                GENERATED_HIGHLIGHT_INSTRUCTIONS,
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
    }),
  );

  if (!response.text) {
    throw new Error("Gemini returned an empty Markdown rewrite.");
  }

  return sanitizeStoredText(
    markdownNoteSchema.parse(parseJsonPayload(response.text)).markdown,
  ).trim();
}

export async function splitMarkdownIntoTopics(markdown: string) {
  const ai = getGoogleAiClient();
  const response = await withProviderRetry("split into topics", () =>
    ai.models.generateContent({
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
                GENERATED_HIGHLIGHT_INSTRUCTIONS,
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
    }),
  );

  if (!response.text) {
    throw new Error("Gemini returned an empty topic split.");
  }

  const topics = topicsSchema.parse(parseJsonPayload(response.text)).topics.map((topic) => ({
    title: sanitizeStoredText(topic.title).trim() || "Generated Topic",
    markdown: sanitizeStoredText(topic.markdown).trim(),
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

/**
 * Scale a vector to unit length.
 *
 * `gemini-embedding-2` already returns unit vectors at 768 dimensions, so this is
 * a no-op there. It stays because it was not one for `gemini-embedding-001`,
 * which returned an L2 norm of about 0.58 at the same size: pgvector cosine
 * distance needs the magnitude gone, and a model swap should not silently change
 * what a stored vector means.
 */
function l2Normalize(values: number[]) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Gemini returned an embedding vector with zero magnitude.");
  }

  return values.map((value) => value / magnitude);
}

export async function embedGeneratedTopics(topics: Array<{ title: string; markdown: string }>) {
  const ai = getGoogleAiClient();
  const response = await withProviderRetry("embed topics", () =>
    ai.models.embedContent({
      model: getRequiredEnv("GEMINI_EMBEDDINGS_MODEL"),
      contents: topics.map((topic) => `${topic.title}\n\n${topic.markdown}`),
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    }),
  );

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
  // One deadline for the whole run, so the four steps' retries share a budget
  // instead of each having its own unbounded one.
  return withDeadline(GENERATION_BUDGET_MS, async () => {
    const parsedText = await extractDocumentText(
      params.fileBuffer,
      params.mimeType,
      params.fileName,
    );
    const markdown = await rewriteParsedTextAsMarkdown(parsedText, params.fileName);
    const topics = await splitMarkdownIntoTopics(markdown);
    const embeddedTopics = await embedGeneratedTopics(topics);

    return {
      parsedText,
      markdown,
      topics: embeddedTopics,
    };
  });
}
