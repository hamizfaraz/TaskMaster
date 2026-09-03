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

function htmlToMarkdown(value: string) {
  const normalized = value.replace(/\n{3,}/g, "\n\n").trim();

  // Treat non-HTML strings as already-authored markdown/plain text so block
  // editors can store direct user input without Turndown escaping markdown.
  if (!/<\/?[a-z][\s\S]*>/i.test(normalized) && !/&[a-z#0-9]+;/i.test(normalized)) {
    return normalized;
  }

  return turndown
    .turndown(normalized)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

/**
 * Convert <span class="note-inline-math" data-latex="…">…</span> back to $…$
 * so that the round-trip markdown stays clean.
 */
function restoreInlineMath(html: string): string {
  return html.replace(
    /<span[^>]*class="note-inline-math"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, latex: string) => `$${latex}$`,
  );
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
      return htmlToMarkdown(restoreInlineMath(block.data.text));
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
      const quoteText = htmlToMarkdown(restoreInlineMath(block.data.text));
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
