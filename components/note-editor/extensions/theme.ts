import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Chrome for the editor surface. Everything maps to the app's semantic CSS
 * variables so light/dark follow `.dark` on <html> with no extra work here.
 */
export const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "1rem",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    lineHeight: "1.75",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--accent)",
  },
  ".cm-line": {
    padding: "0",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-placeholder": {
    color: "var(--muted-foreground)",
    fontStyle: "normal",
  },
});

/**
 * Typography for Markdown tokens. lang-markdown tags syntax markers
 * (`#`, `*`, `>`, `-`, backticks) as `processingInstruction`; live preview
 * hides them off the active line, and this keeps them quiet when visible.
 */
export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, fontSize: "1.9em", fontWeight: "700", lineHeight: "1.25" },
    { tag: tags.heading2, fontSize: "1.5em", fontWeight: "700", lineHeight: "1.3" },
    { tag: tags.heading3, fontSize: "1.25em", fontWeight: "600", lineHeight: "1.4" },
    { tag: tags.heading4, fontSize: "1.1em", fontWeight: "600" },
    { tag: [tags.heading5, tags.heading6], fontWeight: "600" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    {
      tag: tags.strikethrough,
      textDecoration: "line-through",
      color: "var(--muted-foreground)",
    },
    {
      tag: tags.monospace,
      fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, monospace",
      fontSize: "0.92em",
    },
    { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
    { tag: tags.url, color: "var(--muted-foreground)" },
    { tag: tags.quote, color: "var(--muted-foreground)" },
    { tag: tags.processingInstruction, color: "var(--muted-foreground)" },
    { tag: tags.contentSeparator, color: "var(--border-strong)" },
    { tag: tags.list, color: "var(--muted-foreground)" },
  ]),
);
