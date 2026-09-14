import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { findMathRanges, type MathRange } from "@/lib/notes/math-ranges";

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-note-bullet";
    element.textContent = "•";
    return element;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const element = document.createElement("input");
    element.type = "checkbox";
    element.checked = this.checked;
    element.className = "cm-note-checkbox";
    element.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? "[ ]" : "[x]" },
      });
    });
    return element;
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown";
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    // An inline replacement styled as a rule; a real <hr> would need a block
    // decoration, which a ViewPlugin may not provide.
    const element = document.createElement("span");
    element.className = "cm-note-rule";
    element.setAttribute("role", "separator");
    return element;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-note-image";
    const image = document.createElement("img");
    image.src = this.url;
    image.alt = this.alt;
    image.loading = "lazy";
    wrapper.append(image);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Decoration computation
// ---------------------------------------------------------------------------

const hide = Decoration.replace({});
const quoteLine = Decoration.line({ class: "cm-note-quote-line" });
const codeLine = Decoration.line({ class: "cm-note-code-line" });
const tableLine = Decoration.line({ class: "cm-note-table-line" });
const highlightMark = Decoration.mark({ class: "cm-note-highlight" });

const HIGHLIGHT_RE = /==([^=\n]+?)==/g;

/** Lines that contain a cursor or selection show their raw syntax. */
function activeLines(state: EditorState) {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) {
      lines.add(line);
    }
  }
  return lines;
}

function insideAny(ranges: readonly { from: number; to: number }[], from: number, to: number) {
  return ranges.some((range) => from >= range.from && to <= range.to);
}

export function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const tree = syntaxTree(state);
  const active = activeLines(state);
  const decorations: Range<Decoration>[] = [];
  const codeRanges: { from: number; to: number }[] = [];
  // Math is rendered by the math StateField; never decorate inside it, so no
  // two replacements ever overlap.
  const mathRanges: MathRange[] = findMathRanges(state.doc.toString());

  const isActiveAt = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const hideRange = (from: number, to: number) => {
    if (to > from) {
      decorations.push(hide.range(from, to));
    }
  };
  const forEachLineIn = (from: number, to: number, decoration: Decoration) => {
    let pos = from;
    for (;;) {
      const line = state.doc.lineAt(pos);
      decorations.push(decoration.range(line.from));
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        if (name === "FencedCode") {
          codeRanges.push({ from: node.from, to: node.to });
          forEachLineIn(node.from, node.to, codeLine);
          return;
        }
        if (name === "InlineCode") {
          codeRanges.push({ from: node.from, to: node.to });
        }
        if (name === "Table") {
          forEachLineIn(node.from, node.to, tableLine);
          return;
        }
        if (name === "Blockquote") {
          forEachLineIn(node.from, node.to, quoteLine);
        }

        if (isActiveAt(node.from) || insideAny(mathRanges, node.from, node.to)) {
          return;
        }

        switch (name) {
          case "HeaderMark":
          case "EmphasisMark":
          case "StrikethroughMark":
          case "QuoteMark":
          case "CodeMark":
          case "CodeInfo":
          case "LinkMark":
          case "URL":
            hideRange(node.from, node.to);
            return;
          case "ListMark": {
            if (node.node.nextSibling?.name === "Task") {
              hideRange(node.from, node.to); // the checkbox stands in for the bullet
              return;
            }
            if (/^[-*+]$/.test(state.doc.sliceString(node.from, node.to))) {
              decorations.push(
                Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
              );
            }
            return;
          }
          case "TaskMarker": {
            const checked = /\[[xX]\]/.test(state.doc.sliceString(node.from, node.to));
            decorations.push(
              Decoration.replace({
                widget: new CheckboxWidget(checked, node.from, node.to),
              }).range(node.from, node.to),
            );
            return;
          }
          case "HorizontalRule":
            decorations.push(
              Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to),
            );
            return;
          case "Image": {
            const source = state.doc.sliceString(node.from, node.to);
            const match = source.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
            if (match) {
              decorations.push(
                Decoration.replace({ widget: new ImageWidget(match[2]!, match[1] ?? "") }).range(
                  node.from,
                  node.to,
                ),
              );
              return false; // the replacement covers the children
            }
            return;
          }
          default:
            return;
        }
      },
    });
  }

  // `==highlight==` is editor-side sugar (not in lezer or remark-gfm); it is
  // stored as plain markdown, which gives issues #7/#89 a retrievable hook.
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    for (const match of text.matchAll(HIGHLIGHT_RE)) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (insideAny(codeRanges, start, end) || insideAny(mathRanges, start, end)) {
        continue;
      }
      decorations.push(highlightMark.range(start, end));
      if (!isActiveAt(start)) {
        hideRange(start, start + 2);
        hideRange(end - 2, end);
      }
    }
  }

  return Decoration.set(decorations, true);
}

// ---------------------------------------------------------------------------
// Plugin + styles
// ---------------------------------------------------------------------------

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const livePreviewTheme = EditorView.baseTheme({
  ".cm-note-bullet": {
    display: "inline-block",
    width: "1ch",
    color: "var(--muted-foreground)",
  },
  ".cm-note-checkbox": {
    verticalAlign: "-0.1em",
    marginRight: "0.15em",
    accentColor: "var(--accent)",
  },
  ".cm-note-rule": {
    display: "block",
    height: "0",
    borderTop: "1px solid var(--border-strong)",
    margin: "0.6em 0",
  },
  ".cm-note-image img": {
    display: "block",
    maxWidth: "100%",
    borderRadius: "var(--radius-lg)",
    margin: "0.35em 0",
  },
  ".cm-note-quote-line": {
    borderLeft: "3px solid var(--border-strong)",
    paddingLeft: "0.75em !important",
    color: "var(--muted-foreground)",
  },
  ".cm-note-code-line": {
    backgroundColor: "var(--surface-muted)",
    fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, monospace",
    fontSize: "0.9em",
    padding: "0 0.75em !important",
  },
  ".cm-note-table-line": {
    fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, monospace",
    fontSize: "0.9em",
  },
  ".cm-note-highlight": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    borderRadius: "3px",
    padding: "0.05em 0",
  },
});

/**
 * Obsidian-style live preview: Markdown syntax is hidden and rendered on
 * every line except the ones containing the cursor or a selection. Math is
 * handled by `mathWidgets()`; this plugin only stays out of its way.
 */
export function livePreview() {
  return [livePreviewPlugin, livePreviewTheme];
}
