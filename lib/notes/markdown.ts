import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { NoteBlock, NoteContent, NoteDocument, NoteListBlockData, NoteListItem } from "@/lib/notes/types";

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
    case "math":
      return `$$\n${block.data.latex}\n$$`;
    case "inlineMath":
      return `$${block.data.latex}$`;
    default:
      return "";
  }
}

function getBlockSeparator(previous: NoteBlock | undefined, current: NoteBlock) {
  if (
    previous &&
    (previous.type === "inlineMath" || current.type === "inlineMath") &&
    (previous.type === "paragraph" || previous.type === "inlineMath") &&
    (current.type === "paragraph" || current.type === "inlineMath")
  ) {
    return " ";
  }

  return "\n\n";
}

export function serializeNoteDocumentToMarkdown(document: NoteDocument) {
  const sections: string[] = [];
  let previousSerializedBlock: NoteBlock | undefined;

  for (const block of document.blocks) {
    const serialized = serializeBlock(block);
    if (serialized.length === 0) {
      continue;
    }

    if (sections.length > 0) {
      sections.push(getBlockSeparator(previousSerializedBlock, block));
    }

    sections.push(serialized);
    previousSerializedBlock = block;
  }

  return sections.join("");
}

export function createNoteContent(document: NoteDocument): NoteContent {
  return {
    markdown: serializeNoteDocumentToMarkdown(document),
    document,
  };
}
