import { type EditorState, Prec, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, WidgetType } from "@codemirror/view";
import katex from "katex";
import { findMathRanges, type MathRange } from "@/lib/notes/math-ranges";
import {
  enterMath,
  exitMath,
  MathFieldWidget,
  mathSessionField,
} from "@/components/note-editor/extensions/math-field-widget";
import { loadMathLive } from "@/components/note-editor/extensions/mathlive-loader";

// ---------------------------------------------------------------------------
// Opening a region for structural editing
// ---------------------------------------------------------------------------

/** The math range containing or touching `pos`, if any. */
export function mathRangeAt(state: EditorState, pos: number): MathRange | null {
  return findMathRanges(state.doc.toString()).find((range) => range.from <= pos && pos <= range.to) ?? null;
}

/**
 * Swap a region's KaTeX rendering for a MathLive field. MathLive is fetched
 * on first use, so the first open in a session can take a moment.
 */
export function openMathRegion(view: EditorView, range: { from: number; to: number }) {
  void loadMathLive()
    .then(() => {
      if (view.dom.isConnected) {
        view.dispatch({ effects: enterMath.of({ from: range.from, to: range.to }) });
      }
    })
    .catch(() => {
      // The region simply stays as source text; nothing to recover.
    });
}

// ---------------------------------------------------------------------------
// KaTeX rendering (regions not being edited)
// ---------------------------------------------------------------------------

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

  toDOM(view: EditorView) {
    const element = document.createElement(this.display ? "div" : "span");
    element.className = this.display ? "cm-note-math cm-note-math-display" : "cm-note-math";
    element.setAttribute("role", "button");
    element.setAttribute("title", "Edit formula");
    element.innerHTML = renderKatex(this.latex, this.display);
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      // Positions are read from the DOM at click time, so edits elsewhere in
      // the note never leave this widget holding stale offsets.
      const range = mathRangeAt(view.state, view.posAtDOM(element));
      if (range) {
        openMathRegion(view, range);
      }
    });
    return element;
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown";
  }
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

/** A region the selection touches (inclusive) shows its raw `$…$` source. */
function touchesSelection(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

/** Block widgets must cover whole lines; the generator's `$$` fence form does. */
function isBlockShaped(state: EditorState, from: number, to: number) {
  const doc = state.doc;
  const start = doc.lineAt(from);
  const end = doc.lineAt(to);
  return start.number !== end.number && start.from === from && end.to === to;
}

function buildMathDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const session = state.field(mathSessionField, false) ?? null;
  const decorations = [];

  for (const range of findMathRanges(doc.toString())) {
    if (session && range.from < session.to && range.to > session.from) {
      continue; // rendered as the open field below
    }
    if (touchesSelection(state, range.from, range.to)) {
      continue;
    }
    decorations.push(
      Decoration.replace({
        widget: new KatexWidget(range.latex, range.display),
        block: range.display && isBlockShaped(state, range.from, range.to),
      }).range(range.from, range.to),
    );
  }

  if (session) {
    decorations.push(
      Decoration.replace({
        widget: new MathFieldWidget(session, doc.sliceString(session.contentFrom, session.contentTo)),
        block: session.display && isBlockShaped(state, session.from, session.to),
      }).range(session.from, session.to),
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * Math rendering lives in a StateField (not a ViewPlugin) because display
 * math spanning lines needs block-level replace decorations, which only
 * fields may provide. The same set feeds `atomicRanges` so the cursor steps
 * over a rendered formula as one unit.
 */
const mathDecorationsField = StateField.define<DecorationSet>({
  create: buildMathDecorations,
  update(decorations, transaction) {
    const sessionChanged = transaction.effects.some(
      (effect) => effect.is(enterMath) || effect.is(exitMath),
    );
    return transaction.docChanged || transaction.selection || sessionChanged
      ? buildMathDecorations(transaction.state)
      : decorations;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

const mathKeymap = Prec.high(
  keymap.of([
    {
      key: "Mod-e",
      run(view) {
        const range = mathRangeAt(view.state, view.state.selection.main.head);
        if (!range) {
          return false;
        }
        openMathRegion(view, range);
        return true;
      },
    },
  ]),
);

const mathTheme = EditorView.baseTheme({
  ".cm-note-math": {
    display: "inline-block",
    verticalAlign: "baseline",
    cursor: "pointer",
    borderRadius: "3px",
  },
  ".cm-note-math:hover": {
    backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
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

/** Field order matters: the decorations field reads the session field. */
export function mathWidgets() {
  return [mathSessionField, mathDecorationsField, mathKeymap, mathTheme];
}
