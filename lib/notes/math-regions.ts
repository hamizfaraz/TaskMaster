import { normalizeLatex } from "@/lib/math/latex";
import type { NoteBlock, NoteDocument } from "@/lib/notes/types";

type RegionSegment =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "math";
      latex: string;
    }
  | {
      type: "inlineMath";
      latex: string;
    };
type RichTextNoteBlock = Extract<
  NoteBlock,
  { type: "paragraph" | "header" | "quote" }
>;

const INLINE_MATH_SPAN_RE =
  /<span[^>]*class="[^"]*\bnote-inline-math\b[^"]*"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;
const LATEX_REGION_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<!\$)\$(?!\$)([^$\r\n]+?)(?<!\$)\$(?!\$)|\\\(([\s\S]+?)\\\)/g;
const LATEX_SIGNAL_RE = /\\[A-Za-z]+|[\^_{}=<>≤≥≠≈±×÷∞√∑∫→⇒∈∉∂∇∆αβγδθλμσπΩ]/;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hasInlineMathSpan(value: string) {
  INLINE_MATH_SPAN_RE.lastIndex = 0;
  return INLINE_MATH_SPAN_RE.test(value);
}

function richTextToPlainText(value: string) {
  return decodeHtml(
    value
      .replace(INLINE_MATH_SPAN_RE, (_match, latex: string) => `$${latex}$`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\n{3,}/g, "\n\n");
}

/** Structural markers that mean the line is prose, whatever else it contains. */
const NON_MATH_LINE_RE = /^(?:[-*+]\s|\d+\.\s|>|#)/;

/** Delimited math, which is already unambiguous and needs no promotion. */
const DELIMITED_MATH_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\(.*?\\\)|\\\[.*?\\\]/g;

/**
 * Is the whole line raw, undelimited LaTeX?
 *
 * This exists for the block path, where rich text could hold LaTeX with no `$`
 * around it. It has to be strict: a previous version promoted any line under
 * 240 characters that held one of `= + - * / ^ _ < >` and three or fewer
 * longish words, which swallowed list items carrying inline math, an
 * author/ISBN line, `==highlight==`, and `In C, a == b tests equality.` — each
 * of which was then re-serialized as a display-math block, destroying the text.
 *
 * A line qualifies only when it is not structurally prose, carries no code
 * span, has nothing word-like outside its math, and shows real evidence of
 * LaTeX rather than a stray ASCII operator.
 */
function isStandaloneLatexLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240 || !LATEX_SIGNAL_RE.test(trimmed)) {
    return false;
  }

  if (NON_MATH_LINE_RE.test(trimmed) || trimmed.includes("`")) {
    return false;
  }

  if (/^\\begin\{[^}]+\}[\s\S]*\\end\{[^}]+\}$/.test(trimmed)) {
    return true;
  }

  // Prose that merely *contains* math is prose. Ignore LaTeX command names
  // when looking for words, so `\nabla f = 0` is not mistaken for a sentence.
  const outsideMath = trimmed.replace(DELIMITED_MATH_RE, " ").replace(/\\[A-Za-z]+/g, " ");
  if (/[A-Za-z]{2,}/.test(outsideMath)) {
    return false;
  }

  const hasCommand = /\\[A-Za-z]+/.test(trimmed);
  const hasMathSymbol = /[≤≥≠≈±×÷∞√∑∫→⇒∈∉∂∇∆αβγδθλμσπΩ]/.test(trimmed);
  const hasScript = /[\^_]\{?[A-Za-z0-9]/.test(trimmed);
  if (!hasCommand && !hasMathSymbol && !hasScript) {
    return false;
  }

  return (trimmed.match(/[A-Za-z]{3,}/g) ?? []).length <= 3;
}

function pushTextSegment(segments: RegionSegment[], value: string) {
  const normalized = value.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) {
    return;
  }

  const lines = trimmed.split(/\n+/);
  let pendingText: string[] = [];

  const flushText = () => {
    const text = pendingText.join("\n").trim();
    if (text) {
      segments.push({ type: "text", value: text });
    }
    pendingText = [];
  };

  for (const line of lines) {
    if (isStandaloneLatexLine(line)) {
      flushText();
      segments.push({ type: "math", latex: normalizeLatex(line) });
    } else {
      pendingText.push(line);
    }
  }

  flushText();
}

function splitLatexRegions(value: string): RegionSegment[] {
  const plainText = richTextToPlainText(value);
  const segments: RegionSegment[] = [];
  let lastIndex = 0;
  let pendingText = "";

  for (const match of plainText.matchAll(LATEX_REGION_RE)) {
    pendingText += plainText.slice(lastIndex, match.index);
    const isInline = typeof match[3] === "string" || typeof match[4] === "string";
    const latex = normalizeLatex(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
    if (latex) {
      if (isInline) {
        pushTextSegment(segments, pendingText);
        pendingText = "";
        segments.push({ type: "inlineMath", latex });
      } else {
        pushTextSegment(segments, pendingText);
        pendingText = "";
        segments.push({ type: "math", latex });
      }
    }
    lastIndex = (match.index ?? 0) + match[0].length;
  }

  pendingText += plainText.slice(lastIndex);
  pushTextSegment(segments, pendingText);

  return segments;
}

function paragraphBlock(text: string): NoteBlock {
  return {
    type: "paragraph",
    data: {
      text,
    },
  };
}

function mathBlock(latex: string): NoteBlock {
  return {
    type: "math",
    data: {
      latex,
    },
  };
}

function inlineMathBlock(latex: string): NoteBlock {
  return {
    type: "inlineMath",
    data: {
      latex,
    },
  };
}

function richTextBlockLike(block: RichTextNoteBlock, text: string): NoteBlock {
  if (block.type === "header") {
    return {
      ...block,
      data: {
        ...block.data,
        text,
      },
    };
  }

  if (block.type === "quote") {
    return {
      ...block,
      data: {
        ...block.data,
        text,
      },
    };
  }

  return {
    ...block,
    data: {
      text,
    },
  };
}

function convertRichTextBlock(block: NoteBlock): NoteBlock[] {
  if (
    block.type !== "paragraph" &&
    block.type !== "header" &&
    block.type !== "quote"
  ) {
    return [block];
  }

  const sourceText = block.type === "quote" ? block.data.text : block.data.text;
  const signalText = sourceText.replace(/<[^>]+>/g, "");
  if (
    !sourceText ||
    (!sourceText.includes("$") &&
      !sourceText.includes("\\") &&
      !hasInlineMathSpan(sourceText) &&
      !LATEX_SIGNAL_RE.test(signalText))
  ) {
    return [block];
  }

  const segments = splitLatexRegions(sourceText);
  if (segments.length === 0) {
    return [block];
  }

  if (segments.every((segment) => segment.type === "text")) {
    const text = segments.map((segment) => segment.value).join("\n");
    return text === sourceText ? [block] : [richTextBlockLike(block, text)];
  }

  return segments.map((segment) => {
    if (segment.type === "math") {
      return mathBlock(segment.latex);
    }

    if (segment.type === "inlineMath") {
      return inlineMathBlock(segment.latex);
    }

    return paragraphBlock(segment.value);
  });
}

export function normalizeNoteLatexRegions(document: NoteDocument): NoteDocument {
  let changed = false;
  const blocks = document.blocks.flatMap((block) => {
    const converted = convertRichTextBlock(block);
    if (converted.length !== 1 || converted[0] !== block) {
      changed = true;
    }
    return converted;
  }) as NoteBlock[];

  if (!changed) {
    return document;
  }

  return {
    ...document,
    blocks,
  };
}
