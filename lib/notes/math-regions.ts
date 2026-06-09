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

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMathSpan(latex: string) {
  const escaped = escapeHtmlAttr(latex);
  return `<span class="note-inline-math" data-latex="${escaped}">$${latex}$</span>`;
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

function isStandaloneLatexLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240 || !LATEX_SIGNAL_RE.test(trimmed)) {
    return false;
  }

  if (/^\\begin\{[^}]+\}[\s\S]*\\end\{[^}]+\}$/.test(trimmed)) {
    return true;
  }

  const wordCount = (trimmed.match(/[A-Za-z]{3,}/g) ?? []).length;
  const operatorCount = (trimmed.match(/[=+\-*/^_<>≤≥≠≈]/g) ?? []).length;

  return operatorCount > 0 && wordCount <= 3;
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
        pendingText += inlineMathSpan(latex);
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

  return segments.map((segment) =>
    segment.type === "math" ? mathBlock(segment.latex) : paragraphBlock(segment.value),
  );
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
