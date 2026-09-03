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

import type {
  NoteBlock,
  NoteDocument,
  NoteListBlockData,
  NoteListItem,
  NoteTableAlignment,
} from "@/lib/notes/types";
import { normalizeLatex } from "@/lib/math/latex";
import { isInlineMathCandidate } from "@/lib/notes/math-ranges";
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
 * Detect and replace inline math ($…$) within a single line of text, using
 * the same Pandoc rule as the shared scanner in `lib/notes/math-ranges.ts`
 * so the derived block cache agrees with what the editor renders.
 *
 * The result is a <span class="note-inline-math" data-latex="…"> element so
 * the serializer and renderer can round-trip it cleanly.
 */
function processInlineMath(line: string): string {
  // Avoid matching $$ (block math uses doubled dollar signs)
  // Pattern: $<non-empty, non-newline content>$ — negative lookaround for $
  const re = /(?<!\$)\$(?!\$)([^$\r\n]+?)(?<!\$)\$(?!\$)/g;

  return line.replace(re, (match: string, content: string, offset: number) => {
    if (!isInlineMathCandidate(content, line[offset + match.length])) {
      return match;
    }

    const trimmed = content.trim();
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
// GFM tables
// ---------------------------------------------------------------------------

const TABLE_DELIMITER_CELL_RE = /^:?-+:?$/;

/** Split a GFM table row into trimmed cells, honouring `\|` escapes. */
function splitTableRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTableDelimiterRow(line: string): NoteTableAlignment[] | null {
  if (!line.includes("-")) return null;
  const cells = splitTableRow(line);
  if (cells.length === 0 || !cells.every((cell) => TABLE_DELIMITER_CELL_RE.test(cell))) {
    return null;
  }

  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

/** A table starts at `index` when a `|` row is followed by a delimiter row. */
function isTableStart(lines: string[], index: number) {
  const header = lines[index] ?? "";
  const delimiter = lines[index + 1];
  return header.includes("|") && delimiter !== undefined && parseTableDelimiterRow(delimiter) !== null;
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

    // ---- GFM table (header row + delimiter row + body rows) ----
    if (isTableStart(lines, i)) {
      const headerCells = splitTableRow(line);
      const align = parseTableDelimiterRow(lines[i + 1] ?? "") ?? [];
      const columnCount = Math.max(headerCells.length, align.length);
      const fit = (cells: string[]) =>
        Array.from({ length: columnCount }, (_, column) => cells[column] ?? "");
      const rows: string[][] = [fit(headerCells)];
      i += 2;

      while (i < lines.length) {
        const rowLine = lines[i] ?? "";
        if (rowLine.trim() === "" || !rowLine.includes("|") || isBlockStartLine(rowLine)) {
          break;
        }
        rows.push(fit(splitTableRow(rowLine)));
        i++;
      }

      blocks.push({
        type: "table",
        data: {
          rows,
          align: Array.from({ length: columnCount }, (_, column) => align[column] ?? null),
        },
      });
      continue;
    }

    // ---- Empty line ----
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ---- Paragraph — accumulate until next block-starting line ----
    const paragraphLines: string[] = [];
    while (i < lines.length && !isBlockStartLine(lines[i] ?? "") && !isTableStart(lines, i)) {
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
