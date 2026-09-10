import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findCodeRanges, findMathRanges } from "@/lib/notes/math-ranges";
import { openMathRegion } from "@/components/note-editor/extensions/math-widgets";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Markers a line-transform command replaces: heading, list, task, quote. */
const LINE_MARKER_RE = /^(\s*)(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s+)?/;

/**
 * Rewrite the current line's block marker. `from`/`to` are the `/query`
 * being replaced; everything else on the line is kept.
 */
function transformLine(prefix: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const line = view.state.doc.lineAt(from);
    const before = line.text.slice(0, from - line.from);
    const after = line.text.slice(to - line.from);
    const match = before.match(LINE_MARKER_RE);
    const indent = match?.[1] ?? "";
    const rest = before.slice(match?.[0].length ?? 0) + after;
    const text = `${indent}${prefix}${rest}`;

    view.dispatch({
      changes: { from: line.from, to: line.to, insert: text },
      selection: { anchor: line.from + indent.length + prefix.length },
      scrollIntoView: true,
    });
  };
}

/**
 * Insert a block snippet on its own lines. `cursorOffset` is where the cursor
 * lands inside the inserted text.
 */
function insertBlock(snippet: string, cursorOffset: number, onInsert?: (view: EditorView, from: number, to: number) => void) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const doc = view.state.doc;
    const line = doc.lineAt(from);
    const lineIsBare = line.text.slice(0, from - line.from).trim() === "" && line.text.slice(to - line.from).trim() === "";

    // Replace a line that only held the slash query; otherwise break out to a new line.
    const start = lineIsBare ? line.from : from;
    const end = lineIsBare ? line.to : to;
    const lead = lineIsBare || start === line.from ? "" : "\n";
    const insert = `${lead}${snippet}`;

    view.dispatch({
      changes: { from: start, to: end, insert },
      selection: { anchor: start + lead.length + cursorOffset },
      scrollIntoView: true,
    });
    onInsert?.(view, start + lead.length, start + lead.length + snippet.length);
  };
}

function insertInline(snippet: string, cursorOffset: number, onInsert?: (view: EditorView, from: number, to: number) => void) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + cursorOffset },
    });
    onInsert?.(view, from, from + snippet.length);
  };
}

const openMath = (view: EditorView, from: number, to: number) => openMathRegion(view, { from, to });

/**
 * Every insertable block type. `type` is a stable id used by the "+ Block"
 * button for icons; CodeMirror ignores it because the menu runs with
 * `icons: false`. This one list drives both the `/` menu and the button.
 */
export const slashCommands: readonly Completion[] = [
  { label: "Text", type: "text", detail: "Plain paragraph", apply: transformLine("") },
  { label: "Heading 1", type: "h1", detail: "Large section heading", apply: transformLine("# ") },
  { label: "Heading 2", type: "h2", detail: "Section heading", apply: transformLine("## ") },
  { label: "Heading 3", type: "h3", detail: "Subsection heading", apply: transformLine("### ") },
  { label: "Bulleted list", type: "bullet", detail: "Unordered list", apply: transformLine("- ") },
  { label: "Numbered list", type: "number", detail: "Ordered list", apply: transformLine("1. ") },
  { label: "Checklist", type: "checklist", detail: "Task list", apply: transformLine("- [ ] ") },
  { label: "Quote", type: "quote", detail: "Block quote", apply: transformLine("> ") },
  { label: "Code block", type: "code", detail: "Fenced code", apply: insertBlock("```\n\n```", 4) },
  {
    label: "Table",
    type: "table",
    detail: "2×2 table",
    apply: insertBlock("| Column | Column |\n| --- | --- |\n|  |  |", 2),
  },
  { label: "Image", type: "image", detail: "Image from a URL", apply: insertInline("![alt](https://)", 15) },
  { label: "Divider", type: "divider", detail: "Horizontal rule", apply: insertBlock("---", 3) },
  { label: "Math block", type: "math", detail: "Display equation", apply: insertBlock("$$\n\n$$", 3, openMath) },
  { label: "Inline math", type: "inline-math", detail: "Formula in the text", apply: insertInline("$$", 1, openMath) },
];

/**
 * Apply a block command at the cursor with nothing to replace — what the
 * "+ Block" button does. Line commands rewrite the current line's marker;
 * snippet commands break out to a new line when the cursor follows text.
 */
export function applyBlockCommand(view: EditorView, command: Completion) {
  const apply = command.apply;
  if (typeof apply !== "function") {
    return;
  }
  const head = view.state.selection.main.head;
  apply(view, command, head, head);
  view.focus();
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

const SLASH_QUERY_RE = /\/[\w-]*$/;

function insideCodeOrMath(state: EditorState, pos: number) {
  const text = state.doc.toString();
  return (
    findCodeRanges(text).some((range) => pos > range.from && pos < range.to) ||
    findMathRanges(text).some((range) => pos > range.from && pos < range.to)
  );
}

/** `/` at the start of a line or after whitespace opens the menu. */
export function slashSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(SLASH_QUERY_RE);
  if (!match) {
    return null;
  }

  const line = context.state.doc.lineAt(match.from);
  const before = line.text.slice(0, match.from - line.from);
  if ((before !== "" && !/\s$/.test(before)) || insideCodeOrMath(context.state, match.from)) {
    return null;
  }

  return {
    from: match.from,
    options: slashCommands,
    validFor: SLASH_QUERY_RE,
  };
}

const slashTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    backgroundColor: "var(--surface-elevated)",
    boxShadow: "var(--shadow-card)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    maxHeight: "18em",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "0.35em 0.75em",
    color: "var(--foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--foreground)",
  },
  ".cm-completionDetail": {
    marginLeft: "0.75em",
    fontStyle: "normal",
    color: "var(--muted-foreground)",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "600",
  },
});

/** Notion/Obsidian-style `/` command menu for inserting any block type. */
export function slashMenu() {
  return [
    autocompletion({
      override: [slashSource],
      activateOnTyping: true,
      icons: false,
      closeOnBlur: true,
    }),
    slashTheme,
  ];
}
