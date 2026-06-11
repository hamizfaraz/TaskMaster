import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { NoteBlock, NoteDocument, NoteListBlockData, NoteListItem } from "@/lib/notes/types";

const DEFAULT_MAX_TOKENS = 700;

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  linkStyle: "inlined",
  strongDelimiter: "**",
});

turndown.use(gfm);

export type ChunkHeading = {
  level: 1 | 2 | 3;
  text: string;
  blockId?: string;
};

export type ChunkSplitReason = "heading-boundary" | "token-limit" | "oversized-block" | "end-of-document";

export type NoteChunk = {
  id: string;
  chunkIndex: number;
  headingPath: ChunkHeading[];
  sourceBlockIds: string[];
  content: string;
  tokenCount: number;
  isOversized: boolean;
  splitReason: ChunkSplitReason;
};

export type ChunkNoteDocumentOptions = {
  maxTokens?: number;
  noteId?: string;
  countTokens?: (value: string) => number;
};

type SerializedBlock = {
  blockId: string;
  markdown: string;
  tokenText: string;
};

type PendingChunk = {
  bodyBlocks: string[];
  sourceBlockIds: string[];
  bodyTokenCount: number;
  isOversized: boolean;
};

const emptyPendingChunk = (): PendingChunk => ({
  bodyBlocks: [],
  sourceBlockIds: [],
  bodyTokenCount: 0,
  isOversized: false,
});

function defaultCountTokens(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function htmlToMarkdown(value: string) {
  const normalized = value.replace(/\n{3,}/g, "\n\n").trim();

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

function prefixLines(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function serializeListItems(items: NoteListItem[], style: NoteListBlockData["style"], start = 1) {
  const lines: string[] = [];
  const stack = items
    .map((item, index) => ({ item, depth: 0, index, start }))
    .reverse();

  while (stack.length > 0) {
    const { item, depth, index, start: itemStart } = stack.pop()!;
    const content = htmlToMarkdown(item.content);
    const hasContent = content.length > 0;

    if (hasContent) {
      const indent = "    ".repeat(depth);
      const marker =
        style === "checklist"
          ? `- [${item.meta?.checked ? "x" : " "}]`
          : style === "ordered"
            ? `${itemStart + index}.`
            : "-";
      lines.push(`${indent}${marker} ${content}`);
    }

    const childDepth = hasContent ? depth + 1 : depth;
    for (let childIndex = item.items.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push({
        item: item.items[childIndex],
        depth: childDepth,
        index: childIndex,
        start: 1,
      });
    }
  }

  return lines.join("\n");
}

function serializeBlock(block: NoteBlock, fallbackId: string): SerializedBlock | null {
  switch (block.type) {
    case "paragraph": {
      const markdown = htmlToMarkdown(block.data.text);
      return markdown ? { blockId: block.id ?? fallbackId, markdown, tokenText: markdown } : null;
    }
    case "header": {
      const content = htmlToMarkdown(block.data.text);
      if (!content) {
        return null;
      }

      const level = Math.min(Math.max(block.data.level, 1), 6);
      return {
        blockId: block.id ?? fallbackId,
        markdown: `${"#".repeat(level)} ${content}`,
        tokenText: content,
      };
    }
    case "list": {
      const start = typeof block.data.meta?.start === "number" ? block.data.meta.start : 1;
      const markdown = serializeListItems(block.data.items, block.data.style, start);
      return markdown ? { blockId: block.id ?? fallbackId, markdown, tokenText: markdown } : null;
    }
    case "quote": {
      const quoteText = htmlToMarkdown(block.data.text);
      const caption = htmlToMarkdown(block.data.caption);
      const markdown = [quoteText, caption]
        .filter(Boolean)
        .map((section) => prefixLines(section, "> "))
        .join("\n>\n");
      return markdown ? { blockId: block.id ?? fallbackId, markdown, tokenText: markdown } : null;
    }
    case "code": {
      if (!block.data.code.trim()) {
        return null;
      }

      const fence = createCodeFence(block.data.code);
      return {
        blockId: block.id ?? fallbackId,
        markdown: `${fence}\n${block.data.code}\n${fence}`,
        tokenText: block.data.code,
      };
    }
    case "image": {
      const altText = htmlToPlainText(block.data.caption) || "Image";
      const caption = htmlToMarkdown(block.data.caption);
      const imageLine = `![${altText}](${block.data.file.url})`;
      const markdown = caption ? `${imageLine}\n\n${caption}` : imageLine;
      return { blockId: block.id ?? fallbackId, markdown, tokenText: caption || altText };
    }
    case "math": {
      if (!block.data.latex.trim()) {
        return null;
      }

      return {
        blockId: block.id ?? fallbackId,
        markdown: `$$\n${block.data.latex}\n$$`,
        tokenText: block.data.latex,
      };
    }
    default:
      return null;
  }
}

function renderHeadingPath(headingPath: ChunkHeading[]) {
  return headingPath.map((heading) => `${"#".repeat(heading.level)} ${heading.text}`).join("\n");
}

function renderChunkContent(headingPath: ChunkHeading[], bodyBlocks: string[]) {
  return [renderHeadingPath(headingPath), bodyBlocks.join("\n\n")].filter(Boolean).join("\n\n");
}

function getHeadingTokenCount(headingPath: ChunkHeading[], countTokens: (value: string) => number) {
  return headingPath.reduce((total, heading) => total + countTokens(heading.text), 0);
}

function isChunkBoundaryLevel(level: number): level is 1 | 2 | 3 {
  return level === 1 || level === 2 || level === 3;
}

export function chunkNoteDocument(document: NoteDocument, options: ChunkNoteDocumentOptions = {}): NoteChunk[] {
  const maxTokens = Math.max(1, options.maxTokens ?? DEFAULT_MAX_TOKENS);
  const countTokens = options.countTokens ?? defaultCountTokens;
  const noteId = options.noteId ?? "note";
  const chunks: NoteChunk[] = [];
  let headingPath: ChunkHeading[] = [];
  let headingTokenCount = 0;
  let pending = emptyPendingChunk();

  const flush = (splitReason: ChunkSplitReason) => {
    if (pending.bodyBlocks.length === 0) {
      return;
    }

    const chunkIndex = chunks.length;
    chunks.push({
      id: `${noteId}:chunk:${chunkIndex}`,
      chunkIndex,
      headingPath: headingPath.map((heading) => ({ ...heading })),
      sourceBlockIds: [...pending.sourceBlockIds],
      content: renderChunkContent(headingPath, pending.bodyBlocks),
      tokenCount: headingTokenCount + pending.bodyTokenCount,
      isOversized: pending.isOversized,
      splitReason,
    });
    pending = emptyPendingChunk();
  };

  for (const [blockIndex, block] of document.blocks.entries()) {
    const fallbackId = `block:${blockIndex}`;

    if (block.type === "header" && isChunkBoundaryLevel(block.data.level)) {
      const headingText = htmlToMarkdown(block.data.text);
      if (!headingText) {
        continue;
      }

      flush("heading-boundary");
      headingPath = headingPath.filter((heading) => heading.level < block.data.level);
      headingPath.push({
        level: block.data.level,
        text: headingText,
        blockId: block.id,
      });
      headingTokenCount = getHeadingTokenCount(headingPath, countTokens);
      continue;
    }

    const serialized = serializeBlock(block, fallbackId);
    if (!serialized) {
      continue;
    }

    const blockTokenCount = countTokens(serialized.tokenText);
    const projectedTokenCount = headingTokenCount + pending.bodyTokenCount + blockTokenCount;
    if (pending.bodyBlocks.length > 0 && projectedTokenCount > maxTokens) {
      flush("token-limit");
    }

    const tokenCount = headingTokenCount + blockTokenCount;
    pending.bodyBlocks.push(serialized.markdown);
    pending.sourceBlockIds.push(serialized.blockId);
    pending.bodyTokenCount += blockTokenCount;

    if (tokenCount > maxTokens) {
      pending.isOversized = true;
      flush("oversized-block");
    }
  }

  flush("end-of-document");

  return chunks;
}
