import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type {
  NoteBlock,
  NoteContent,
  NoteDocument,
  NoteListBlockData,
  NoteListItem,
  NoteTableAlignment,
} from "@/lib/notes/types";

// Re-export the canonical parser from its own module.
export { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";

// ---------------------------------------------------------------------------
// NoteDocument → Markdown serializer
// ---------------------------------------------------------------------------

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  linkStyle: "inlined",
  strongDelimiter: "**",
});

turndown.use(gfm);

/**
 * Private-use characters that stand in for a protected run (a math region or an
 * existing backslash escape) while Turndown runs.
 * Turndown escapes Markdown punctuation, so LaTeX handed to it directly comes
 * back with its backslashes doubled (`$\\mathbb{Q}$` → `$\\\\mathbb{Q}$`), and
 * that doubling compounds on every save. These never occur in note text and
 * Turndown leaves them alone.
 */
const MATH_PLACEHOLDER_OPEN = "\uE000";
const MATH_PLACEHOLDER_CLOSE = "\uE001";

/**
 * Matches the inline-math span that `renderInlineMarkdownText` emits, capturing
 * its `data-latex`. Exported because both directions need it: the serializer
 * turns these back into `$…$`, and the editor's table widget renders the
 * captured LaTeX with KaTeX.
 */
export const INLINE_MATH_SPAN_RE =
  /<span[^>]*class="[^"]*\bnote-inline-math\b[^"]*"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;

/** Inverse of the attribute escaping in `parse-markdown.ts`. */
export function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlToMarkdown(value: string) {
  const normalized = value.replace(/\n{3,}/g, "\n\n").trim();

  // Treat non-HTML strings as already-authored markdown/plain text so block
  // editors can store direct user input without Turndown escaping markdown.
  if (!/<\/?[a-z][\s\S]*>/i.test(normalized) && !/&[a-z#0-9]+;/i.test(normalized)) {
    return normalized;
  }

  // Swap math regions and existing backslash escapes out before Turndown sees
  // them, and back afterwards. A `\*` in the text is already a valid Markdown
  // escape; letting Turndown escape its backslash again turns it into `\\*`,
  // and that doubling compounds on every save.
  const protectedRuns: string[] = [];
  const protect = (value: string) => {
    protectedRuns.push(value);
    return `${MATH_PLACEHOLDER_OPEN}${protectedRuns.length - 1}${MATH_PLACEHOLDER_CLOSE}`;
  };

  INLINE_MATH_SPAN_RE.lastIndex = 0;
  const guarded = normalized
    .replace(INLINE_MATH_SPAN_RE, (_match, latex: string) =>
      protect(`$${decodeHtmlAttribute(latex)}$`),
    )
    .replace(/\\[\\`*_{}[\]()#+\-.!|~]/g, (match) => protect(match));

  const converted = turndown.turndown(guarded).replace(/\n{3,}/g, "\n\n").trim();

  return converted.replace(
    new RegExp(`${MATH_PLACEHOLDER_OPEN}(\\d+)${MATH_PLACEHOLDER_CLOSE}`, "g"),
    (_match, index: string) => protectedRuns[Number(index)] ?? "",
  );
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createCodeFence(code: string) {
  const matches = code.match(/`+/g) ?? [];
  const longestFence = matches.reduce((longest, match) => Math.max(longest, match.length), 0);

  return "`".repeat(Math.max(3, longestFence + 1));
}

function serializeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function serializeTableAlignment(alignment: NoteTableAlignment | undefined) {
  switch (alignment) {
    case "left":
      return ":--";
    case "center":
      return ":-:";
    case "right":
      return "--:";
    default:
      return "---";
  }
}

function prefixLines(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function serializeListItems(
  items: NoteListItem[],
  style: NoteListBlockData["style"],
  depth = 0,
  start = 1,
): string[] {
  return items.flatMap((item, index) => {
    const indent = "    ".repeat(depth);
    const itemContent = htmlToMarkdown(item.content) || " ";
    const marker =
      style === "checklist"
        ? `- [${item.meta?.checked ? "x" : " "}]`
        : style === "ordered"
          ? `${start + index}.`
          : "-";
    const lines = [`${indent}${marker} ${itemContent}`];

    if (item.items.length > 0) {
      lines.push(...serializeListItems(item.items, style, depth + 1));
    }

    return lines;
  });
}

function serializeBlock(block: NoteBlock) {
  switch (block.type) {
    case "paragraph":
      return htmlToMarkdown(block.data.text);
    case "header": {
      const level = Math.min(Math.max(block.data.level, 1), 4);
      const content = htmlToMarkdown(block.data.text);
      return content ? `${"#".repeat(level)} ${content}` : "";
    }
    case "list": {
      const start = typeof block.data.meta?.start === "number" ? block.data.meta.start : 1;
      return serializeListItems(block.data.items, block.data.style, 0, start).join("\n");
    }
    case "quote": {
      const quoteText = htmlToMarkdown(block.data.text);
      const caption = htmlToMarkdown(block.data.caption);
      return [quoteText, caption]
        .filter(Boolean)
        .map((section) => prefixLines(section, "> "))
        .join("\n>\n");
    }
    case "code": {
      const fence = createCodeFence(block.data.code);
      const lang = block.data.language ?? "";
      return `${fence}${lang}\n${block.data.code}\n${fence}`;
    }
    case "mermaid": {
      const fence = createCodeFence(block.data.code);
      return `${fence}mermaid\n${block.data.code}\n${fence}`;
    }
    case "image": {
      const altText = htmlToPlainText(block.data.caption) || "Image";
      const caption = htmlToMarkdown(block.data.caption);
      const imageLine = `![${altText}](${block.data.file.url})`;
      return caption ? `${imageLine}\n\n${caption}` : imageLine;
    }
    case "table": {
      const [header = [], ...body] = block.data.rows;
      const columnCount = Math.max(header.length, ...body.map((row) => row.length), 1);
      const row = (cells: string[]) =>
        `| ${Array.from({ length: columnCount }, (_, column) => serializeTableCell(cells[column] ?? "")).join(" | ")} |`;
      const delimiter = `| ${Array.from({ length: columnCount }, (_, column) =>
        serializeTableAlignment(block.data.align?.[column]),
      ).join(" | ")} |`;
      return [row(header), delimiter, ...body.map(row)].join("\n");
    }
    case "math":
      return `$$\n${block.data.latex}\n$$`;
    case "inlineMath":
      return `$${block.data.latex}$`;
    default: {
      // Every NoteBlock must serialize; a new block type that is not handled
      // here would otherwise vanish from the markdown column silently.
      const unhandled: never = block;
      throw new Error(`Unhandled note block type: ${String((unhandled as NoteBlock).type)}`);
    }
  }
}

/** Characters that must hug the preceding inline math (`$x$.` not `$x$ .`). */
const CLOSING_PUNCTUATION_RE = /^[.,;:!?)\]}]/;
/** Characters that must hug the following inline math (`($x$` not `( $x$`). */
const OPENING_PUNCTUATION_RE = /[(\[{]$/;

function getBlockSeparator(
  previous: NoteBlock | undefined,
  current: NoteBlock,
  previousText: string,
  currentText: string,
) {
  if (
    previous &&
    (previous.type === "inlineMath" || current.type === "inlineMath") &&
    (previous.type === "paragraph" || previous.type === "inlineMath") &&
    (current.type === "paragraph" || current.type === "inlineMath")
  ) {
    if (previous.type === "inlineMath" && CLOSING_PUNCTUATION_RE.test(currentText)) {
      return "";
    }
    if (current.type === "inlineMath" && OPENING_PUNCTUATION_RE.test(previousText)) {
      return "";
    }
    return " ";
  }

  return "\n\n";
}

export function serializeNoteDocumentToMarkdown(document: NoteDocument) {
  const sections: string[] = [];
  let previousSerializedBlock: NoteBlock | undefined;
  let previousSerializedText = "";

  for (const block of document.blocks) {
    const serialized = serializeBlock(block);
    if (serialized.length === 0) {
      continue;
    }

    if (sections.length > 0) {
      sections.push(
        getBlockSeparator(previousSerializedBlock, block, previousSerializedText, serialized),
      );
    }

    sections.push(serialized);
    previousSerializedBlock = block;
    previousSerializedText = serialized;
  }

  return sections.join("");
}

export function createNoteContent(document: NoteDocument): NoteContent {
  return {
    markdown: serializeNoteDocumentToMarkdown(document),
    document,
  };
}
