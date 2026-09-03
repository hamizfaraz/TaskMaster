/**
 * Markdown → NoteDocument parser.
 *
 * Pure JS, no external dependencies, safe to run on both client and server.
 *
 * Handles:
 *   - ATX headings (#, ##, …)
 *   - Fenced code blocks (``` or ~~~) with optional language hint
 *   - Mermaid diagrams (```mermaid)
 *   - Block math ($$…$$)
 *   - Blockquotes (>)
 *   - Ordered / unordered / checklist lists
 *   - Inline math ($…$) as inline math blocks
 *   - Paragraphs (everything else)
 */

import type { NoteBlock, NoteDocument, NoteListBlockData, NoteListItem } from "@/lib/notes/types";
import { normalizeLatex } from "@/lib/math/latex";
import { normalizeNoteLatexRegions } from "@/lib/notes/math-regions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function restoreInlineTokens(value: string, tokens: string[]) {
  return tokens.reduce(
    (current, token, index) => current.replaceAll(`\u0000${index}\u0000`, token),
    value,
  );
}

/**
 * Detect and replace inline math ($…$) within a single line of text.
 *
 * Heuristic: we match $content$ where content is non-empty and contains at
 * least one LaTeX-typical character (backslash, caret, underscore, or braces)
 * OR is a short single-token that doesn't look like a shell / currency value.
 * This avoids false-positives on "$HOME", "$5.99", etc.
 *
 * The result is a <span class="note-inline-math" data-latex="…"> element so
 * the serializer and renderer can round-trip it cleanly.
 */
function processInlineMath(line: string): string {
  // Avoid matching $$ (block math uses doubled dollar signs)
  // Pattern: $<non-empty, non-newline content>$ — negative lookaround for $
  const re = /(?<!\$)\$(?!\$)([^$\r\n]+?)(?<!\$)\$(?!\$)/g;

  return line.replace(re, (_match, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return _match;

    // Accept as inline math if content contains any LaTeX-specific char, or
    // is a multi-character expression that can't be a bare shell identifier.
    const hasLatexChar = /[\\^_{}]/.test(trimmed);
    const isBareShellId = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed);
    const isCurrency = /^\d/.test(trimmed);

    if (!hasLatexChar && (isBareShellId || isCurrency)) {
      return _match; // leave untouched
    }

    return `<span class="note-inline-math" data-latex="${escapeHtmlAttr(trimmed)}">$${trimmed}$</span>`;
  });
}

export function renderInlineMarkdownText(line: string): string {
  const tokens: string[] = [];
  const stash = (html: string) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  const withCodeTokens = line.replace(/`([^`\r\n]+?)`/g, (_match, code: string) =>
    stash(`<code>${escapeHtmlText(code)}</code>`),
  );
  const withMathTokens = processInlineMath(withCodeTokens).replace(
    /<span class="note-inline-math"[\s\S]*?<\/span>/g,
    (match) => stash(match),
  );

  let html = escapeHtmlText(withMathTokens);

  html = html.replace(
    /\[([^\]\r\n]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) =>
      `<a href="${escapeHtmlAttr(href)}">${label}</a>`,
  );
  html = html.replace(
    /(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g,
    "<strong><em>$2</em></strong>",
  );
  html = html.replace(
    /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g,
    "<strong>$2</strong>",
  );
  html = html.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>");
  html = html.replace(/(^|[^\*])\*(?=\S)([^*\r\n]*?\S)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^_])_(?=\S)([^_\r\n]*?\S)_/g, "$1<em>$2</em>");

  return restoreInlineTokens(html, tokens);
}

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

function normalizeFenceLanguage(language: string | undefined) {
  return (language ?? "").trim().toLowerCase().replace(/^language-/, "");
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
      const normalizedLang = normalizeFenceLanguage(lang);
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith(fence)) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      if (normalizedLang === "mermaid" || normalizedLang === "mmd") {
        blocks.push({
          type: "mermaid",
          data: {
            code: codeLines.join("\n"),
          },
        });
      } else {
        blocks.push({
          type: "code",
          data: {
            code: codeLines.join("\n"),
            ...(lang ? { language: lang } : {}),
          },
        });
      }
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
        data: { text: renderInlineMarkdownText((headingMatch[2] ?? "").trim()), level },
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
          text: quoteLines.map(renderInlineMarkdownText).join("<br>"),
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
        const content = renderInlineMarkdownText(rawContent);
        const checked = clMatch ? clMatch[1] !== " " : false;
        items.push({
          content,
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
      const text = paragraphLines.map(renderInlineMarkdownText).join("<br>");
      blocks.push({ type: "paragraph", data: { text } });
    }
  }

  return normalizeNoteLatexRegions({ time: Date.now(), blocks });
}
