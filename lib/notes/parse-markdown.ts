/**
 * Markdown → NoteDocument parser.
 *
 * Pure JS, no external dependencies, safe to run on both client and server.
 *
 * Handles:
 *   - ATX headings (#, ##, …)
 *   - Fenced code blocks (``` or ~~~) with optional language hint
 *   - Block math ($$…$$)
 *   - Blockquotes (>)
 *   - Ordered / unordered / checklist lists
 *   - Inline math ($…$) as inline math blocks
 *   - Paragraphs (everything else)
 */

import type { NoteBlock, NoteDocument, NoteListBlockData, NoteListItem } from "@/lib/notes/types";
import { normalizeLatex } from "@/lib/math/latex";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";

function isListLine(line: string) {
  return /^[-*+]\s/.test(line) || /^\d+\.\s/.test(line);
}

function isBlockStartLine(line: string) {
  return (
    line.trim() === "" ||
    /^#{1,6}\s/.test(line) ||
    line.startsWith("> ") ||
    /^(`{3,}|~{3,})/.test(line) ||
    line.trim() === "$$" ||
    isListLine(line)
  );
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseMarkdownToNoteDocument(markdown: string): NoteDocument {
  const blocks: NoteBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // ---- Fenced code block (``` or ~~~) with optional language ----
    const codeFenceMatch = line.match(/^(`{3,}|~{3,})\s*(\S*)/);
    if (codeFenceMatch) {
      const fence = codeFenceMatch[1]!;
      const lang = (codeFenceMatch[2] ?? "").trim() || undefined;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith(fence)) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      blocks.push({
        type: "code",
        data: {
          code: codeLines.join("\n"),
          ...(lang ? { language: lang } : {}),
        },
      });
      continue;
    }

    // ---- Block math ($$ … $$) ----
    if (line.trim() === "$$") {
      i++;
      const mathLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim() !== "$$") {
        mathLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing $$
      blocks.push({ type: "math", data: { latex: normalizeLatex(mathLines.join("\n")) } });
      continue;
    }

    // ---- ATX Heading ----
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1]!.length) as 1 | 2 | 3 | 4;
      blocks.push({
        type: "header",
        data: { text: (headingMatch[2] ?? "").trim(), level },
      });
      i++;
      continue;
    }

    // ---- Blockquote ----
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        quoteLines.push((lines[i] ?? "").slice(2));
        i++;
      }
      blocks.push({
        type: "quote",
        data: {
          text: quoteLines.join("<br>"),
          caption: "",
          alignment: "left",
        },
      });
      continue;
    }

    // ---- List (ordered / unordered / checklist) ----
    if (isListLine(line)) {
      const isChecklist = /^[-*+]\s+\[[ xX]\]/.test(line);
      const isOrdered = /^\d+\.\s/.test(line) && !isChecklist;
      const style: NoteListBlockData["style"] = isChecklist
        ? "checklist"
        : isOrdered
          ? "ordered"
          : "unordered";
      const items: NoteListItem[] = [];

      while (i < lines.length && isListLine(lines[i] ?? "")) {
        const itemLine = lines[i] ?? "";
        const clMatch = itemLine.match(/^[-*+]\s+\[([ xX])\]\s*(.*)/);
        const olMatch = itemLine.match(/^\d+\.\s+(.*)/);
        const ulMatch = itemLine.match(/^[-*+]\s+(.*)/);
        const rawContent = (clMatch?.[2] ?? olMatch?.[1] ?? ulMatch?.[1] ?? "").trim();
        const checked = clMatch ? clMatch[1] !== " " : false;
        items.push({
          content: rawContent,
          meta: style === "checklist" ? { checked } : {},
          items: [],
        });
        i++;
      }

      if (items.length > 0) {
        blocks.push({ type: "list", data: { style, items } });
      }
      continue;
    }

    // ---- Empty line ----
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ---- Paragraph — accumulate until next block-starting line ----
    const paragraphLines: string[] = [];
    while (i < lines.length && !isBlockStartLine(lines[i] ?? "")) {
      paragraphLines.push(lines[i] ?? "");
      i++;
    }
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join("<br>");
      blocks.push({ type: "paragraph", data: { text } });
    }
  }

  return normalizeNoteLatexRegions({ time: Date.now(), blocks });
}
