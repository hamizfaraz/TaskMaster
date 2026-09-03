import { type EditorState, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import katex from "katex";
import { findMathRanges } from "@/lib/notes/math-ranges";

const katexCache = new Map<string, string>();

function renderKatex(latex: string, display: boolean) {
  const key = `${display ? "D" : "I"}${latex}`;
  let html = katexCache.get(key);
  if (html === undefined) {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      output: "htmlAndMathml",
    });
    katexCache.set(key, html);
  }
  return html;
}

class KatexWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(other: KatexWidget) {
    return other.latex === this.latex && other.display === this.display;
  }

  toDOM() {
    const element = document.createElement(this.display ? "div" : "span");
    element.className = this.display ? "cm-note-math cm-note-math-display" : "cm-note-math";
    element.innerHTML = renderKatex(this.latex, this.display);
    return element;
  }

  ignoreEvent() {
    // A click lands the cursor at the widget's edge, which "touches" the
    // region and reveals its source — the Obsidian live-preview behaviour.
    return false;
  }
}

/** A region the selection touches (inclusive) shows its raw `$…$` source. */
function touchesSelection(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildMathDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const decorations = [];

  for (const range of findMathRanges(doc.toString())) {
    if (touchesSelection(state, range.from, range.to)) {
      continue;
    }

    // Block widgets must cover whole lines; the generator's `$$` fence form
    // does, anything else renders inline (which may hide its line breaks).
    const startsLine = doc.lineAt(range.from).from === range.from;
    const endsLine = doc.lineAt(range.to).to === range.to;
    const spansLines = doc.lineAt(range.from).number !== doc.lineAt(range.to).number;
    const block = range.display && spansLines && startsLine && endsLine;

    decorations.push(
      Decoration.replace({
        widget: new KatexWidget(range.latex, range.display),
        block,
      }).range(range.from, range.to),
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * Math rendering lives in a StateField (not a ViewPlugin) because display
 * math spanning lines needs block-level replace decorations, which only
 * fields may provide. The same field feeds `atomicRanges` so the cursor
 * steps over a rendered formula as one unit.
 */
const mathDecorationsField = StateField.define<DecorationSet>({
  create: buildMathDecorations,
  update(decorations, transaction) {
    return transaction.docChanged || transaction.selection
      ? buildMathDecorations(transaction.state)
      : decorations;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

const mathTheme = EditorView.baseTheme({
  ".cm-note-math": {
    display: "inline-block",
    verticalAlign: "baseline",
  },
  ".cm-note-math-display": {
    display: "block",
    padding: "0.35em 0",
    textAlign: "center",
  },
  ".cm-note-math .katex": {
    fontSize: "1.05em",
  },
  ".cm-note-math .katex-display": {
    margin: "0",
  },
});

export function mathWidgets() {
  return [mathDecorationsField, mathTheme];
}
