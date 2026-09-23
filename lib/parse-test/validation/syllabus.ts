import { inflateSync } from "node:zlib";
import { ParseTestError, type ParseActivityLogger } from "../errors";

export type SyllabusValidationResult = {
  isLikelySyllabus: boolean;
  score: number;
  matchedSignals: string[];
  reason: string;
};

function normaliseValidationText(value: string) {
  return value
    .replace(/\0/g, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function decodePdfLiteralText(value: string) {
  return value
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\([nrtbf])/g, (_match, escapeChar) => {
      switch (escapeChar) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
          return "\b";
        case "f":
          return "\f";
        default:
          return escapeChar;
      }
    })
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\\r?\n/g, "");
}

function decodePdfHexText(value: string) {
  const evenLength = value.length % 2 === 0 ? value : `${value}0`;

  try {
    return Buffer.from(evenLength, "hex").toString("latin1");
  } catch {
    return "";
  }
}

function extractPdfTextChunks(content: string) {
  const chunks: string[] = [];
  const literalPattern = /\((?:\\.|[^\\()])*\)/g;
  const hexPattern = /<([0-9A-Fa-f\s]+)>/g;

  for (const match of content.matchAll(literalPattern)) {
    const literal = match[0].slice(1, -1);
    const decoded = decodePdfLiteralText(literal).trim();
    if (decoded) {
      chunks.push(decoded);
    }
  }

  for (const match of content.matchAll(hexPattern)) {
    const decoded = decodePdfHexText(match[1].replace(/\s+/g, "")).trim();
    if (decoded) {
      chunks.push(decoded);
    }
  }

  return chunks;
}

function extractCandidateSyllabusText(fileName: string, fileBuffer: Buffer) {
  const rawPdfText = fileBuffer.toString("latin1");
  const chunks = [fileName, rawPdfText];
  const streamPattern = /(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;

  for (const match of rawPdfText.matchAll(streamPattern)) {
    const [, streamHeader, streamBody] = match;
    const streamTexts = [streamBody];

    if (/flatedecode/i.test(streamHeader)) {
      try {
        streamTexts.push(inflateSync(Buffer.from(streamBody, "latin1")).toString("latin1"));
      } catch {
        // Best-effort only. Validation falls back to the raw PDF bytes when decompression fails.
      }
    }

    for (const streamText of streamTexts) {
      chunks.push(streamText);
      chunks.push(...extractPdfTextChunks(streamText));
    }
  }

  return chunks.join("\n").slice(0, 500_000);
}

function scoreSyllabusSignals(fileNameText: string, documentText: string): SyllabusValidationResult {
  const signalGroups = [
    { label: "syllabus", weight: 4, pattern: /\bsyllabus\b/i },
    { label: "syllabus abbreviation", weight: 2, pattern: /\bsyl\b/i },
    { label: "course description", weight: 3, pattern: /\bcourse\s+description\b/i },
    { label: "grading policy", weight: 3, pattern: /\bgrading(?:\s+policy)?\b/i },
    { label: "office hours", weight: 3, pattern: /\boffice\s+hours\b/i },
    { label: "learning outcomes", weight: 3, pattern: /\blearning\s+outcomes?\b/i },
    { label: "required materials", weight: 3, pattern: /\brequired\s+materials?\b/i },
    { label: "required textbook", weight: 3, pattern: /\brequired\s+text(?:book|books?)\b/i },
    { label: "assignment", weight: 2, pattern: /\bassignments?\b/i },
    { label: "exam", weight: 2, pattern: /\bexam(?:s)?\b/i },
    { label: "quiz", weight: 2, pattern: /\bquiz(?:zes)?\b/i },
    { label: "attendance", weight: 2, pattern: /\battendance\b/i },
    { label: "course objectives", weight: 2, pattern: /\bcourse\s+objectives?\b/i },
    { label: "schedule", weight: 2, pattern: /\bschedule\b/i },
    { label: "academic integrity", weight: 2, pattern: /\bacademic\s+integrity\b/i },
    { label: "course information", weight: 1, pattern: /\bcourse\s+information\b/i },
    { label: "required texts", weight: 1, pattern: /\brequired\s+texts?\b/i },
    { label: "evaluation", weight: 1, pattern: /\bevaluation\b/i },
    { label: "week 1", weight: 1, pattern: /\bweek\s+1\b/i },
    {
      label: "calendar date",
      weight: 1,
      pattern:
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i,
    },
  ] as const;

  const matchedSignals: string[] = [];
  let score = 0;

  for (const signal of signalGroups) {
    const fileNameMatch = signal.pattern.test(fileNameText);
    const documentMatch = signal.pattern.test(documentText);

    if (fileNameMatch) {
      score += Math.max(1, Math.ceil(signal.weight / 2));
      matchedSignals.push(`filename:${signal.label}`);
    }

    if (documentMatch) {
      score += signal.weight;
      matchedSignals.push(`document:${signal.label}`);
    }
  }

  const hasFilenameSyllabus = matchedSignals.includes("filename:syllabus");
  const hasSyllabusSignal = matchedSignals.some((signal) => signal.endsWith(":syllabus"));
  const hasAdditionalAcademicSignal = matchedSignals.some((signal) => !signal.endsWith(":syllabus"));
  const hasNegativeResumeSignal =
    /\b(?:resume|curriculum vitae|cv)\b/i.test(fileNameText) ||
    /\b(?:resume|curriculum vitae)\b/i.test(documentText);
  const isLikelySyllabus =
    !hasNegativeResumeSignal &&
    (hasFilenameSyllabus ||
      score >= 8 ||
      (hasSyllabusSignal && hasAdditionalAcademicSignal));

  return {
    isLikelySyllabus,
    score,
    matchedSignals,
    reason: isLikelySyllabus
      ? "The PDF contains enough syllabus-like structure to proceed to Gemini."
      : hasNegativeResumeSignal
        ? "The PDF looks more like a resume/CV than a course syllabus."
        : "The PDF did not contain enough syllabus-specific academic signals after local validation.",
  };
}

export function validateSyllabusCandidate(fileName: string, fileBuffer: Buffer, log?: ParseActivityLogger) {
  const fileNameText = normaliseValidationText(fileName);
  const documentText = normaliseValidationText(extractCandidateSyllabusText(fileName, fileBuffer));
  const result = scoreSyllabusSignals(fileNameText, documentText);

  if (result.isLikelySyllabus) {
    log?.(
      `Syllabus validation accepted (score ${result.score}). Signals: ${
        result.matchedSignals.slice(0, 6).join(", ") || "none"
      }.`,
    );
    return result;
  }

  console.warn("ParseTest rejected upload during local syllabus validation.", {
    fileName,
    score: result.score,
    matchedSignals: result.matchedSignals,
    reason: result.reason,
  });

  throw new ParseTestError("This PDF does not appear to be a course syllabus.", 422, result);
}
