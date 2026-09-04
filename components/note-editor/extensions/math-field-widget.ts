import { type EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import type { MathfieldElement } from "mathlive";
import { normalizeLatex } from "@/lib/math/latex";

// ---------------------------------------------------------------------------
// Session: which math region is currently open in a <math-field>
// ---------------------------------------------------------------------------

export type MathSession = {
  id: number;
  /** Region including delimiters. */
  from: number;
  to: number;
  /** Document text between the delimiters (may include fence newlines). */
  contentFrom: number;
  contentTo: number;
  display: boolean;
  /** Content when the session opened, verbatim (for one-step undo and fence layout). */
  originalLatex: string;
};

/** Open the region `[from, to)` (including its `$` / `$$` delimiters). */
export const enterMath = StateEffect.define<{ from: number; to: number }>({
  map: (value, mapping) => ({ from: mapping.mapPos(value.from), to: mapping.mapPos(value.to) }),
});
export const exitMath = StateEffect.define<null>();

let nextSessionId = 1;

function delimiterLength(text: string) {
  return text.startsWith("$$") && text.endsWith("$$") && text.length >= 4 ? 2 : 1;
}

function sessionFromRange(state: EditorState, from: number, to: number): MathSession | null {
  const text = state.doc.sliceString(from, to);
  const length = delimiterLength(text);
  const delimiter = "$".repeat(length);
  if (text.length < length * 2 || !text.startsWith(delimiter) || !text.endsWith(delimiter)) {
    return null;
  }

  return {
    id: nextSessionId++,
    from,
    to,
    contentFrom: from + length,
    contentTo: to - length,
    display: length === 2,
    originalLatex: text.slice(length, -length),
  };
}

export const mathSessionField = StateField.define<MathSession | null>({
  create: () => null,
  update(session, transaction) {
    let next = session;

    if (next && transaction.docChanged) {
      // Grow the content range around insertions at either edge; drop the
      // session if the delimiters themselves were touched.
      const mapped: MathSession = {
        ...next,
        from: transaction.changes.mapPos(next.from, -1),
        contentFrom: transaction.changes.mapPos(next.contentFrom, -1),
        contentTo: transaction.changes.mapPos(next.contentTo, 1),
        to: transaction.changes.mapPos(next.to, 1),
      };
      const delimiter = "$".repeat(mapped.display ? 2 : 1);
      const doc = transaction.state.doc;
      const intact =
        mapped.contentFrom <= mapped.contentTo &&
        doc.sliceString(mapped.from, mapped.contentFrom) === delimiter &&
        doc.sliceString(mapped.contentTo, mapped.to) === delimiter;
      next = intact ? mapped : null;
    }

    for (const effect of transaction.effects) {
      if (effect.is(exitMath)) {
        next = null;
      } else if (effect.is(enterMath)) {
        next = sessionFromRange(transaction.state, effect.value.from, effect.value.to);
      }
    }

    return next;
  },
});

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

let lastFocusedSessionId = 0;

const STOP_PROPAGATION_EVENTS = ["beforeinput", "keyup", "pointerdown", "mousedown", "click"] as const;

/**
 * The generator writes display math as `$$\n…\n$$`. The fence newlines live
 * outside the field: they are fixed when a session opens and re-applied on
 * every write, so the document keeps its shape while the user edits.
 */
function fenceLayout(originalLatex: string) {
  const lead = /^\s*\n/.test(originalLatex) ? "\n" : "";
  const trail = /\n\s*$/.test(originalLatex) ? "\n" : "";
  return (latex: string) => `${lead}${latex}${trail}`;
}

/**
 * Hosts a MathLive `<math-field>` in place of a math region. MathLive owns
 * the keyboard while focused (so Backspace deletes a fraction or root as a
 * unit); every edit is written straight back into the document with
 * `addToHistory: false`, and leaving the field turns the whole session into
 * a single undo step.
 */
export class MathFieldWidget extends WidgetType {
  constructor(
    readonly session: MathSession,
    readonly latex: string,
  ) {
    super();
  }

  eq(other: MathFieldWidget) {
    return (
      other.session.id === this.session.id &&
      other.session.display === this.session.display &&
      other.latex === this.latex
    );
  }

  /** Same session, new LaTeX (undo/redo while unfocused): sync the field without recreating it. */
  updateDOM(dom: HTMLElement) {
    const latex = this.latex.trim();
    const field = dom.querySelector("math-field") as MathfieldElement | null;
    if (field && field.value !== latex) {
      field.setValue(latex, { silenceNotifications: true });
    }
    const source = dom.querySelector<HTMLTextAreaElement>(".cm-note-mathfield-source");
    if (source && source.value !== latex) {
      source.value = latex;
    }
    return true;
  }

  ignoreEvent() {
    return true; // the field handles its own events; CodeMirror stays out
  }

  toDOM(view: EditorView) {
    const wrap = fenceLayout(this.session.originalLatex);
    const initialLatex = this.latex.trim();

    const wrapper = document.createElement(this.session.display ? "div" : "span");
    wrapper.className = this.session.display
      ? "cm-note-mathfield cm-note-mathfield-display"
      : "cm-note-mathfield";
    wrapper.contentEditable = "false";

    const field = document.createElement("math-field") as MathfieldElement;
    field.setAttribute("math-virtual-keyboard-policy", "manual");
    field.setAttribute("smart-mode", "on");
    field.setAttribute("placeholder", "\\frac{a}{b}");
    field.defaultMode = this.session.display ? "math" : "inline-math";
    field.value = initialLatex;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cm-note-mathfield-toggle";
    toggle.textContent = "LaTeX";
    toggle.title = "Edit the LaTeX directly";
    toggle.setAttribute("aria-pressed", "false");

    const source = document.createElement("textarea");
    source.className = "cm-note-mathfield-source";
    source.rows = this.session.display ? 3 : 1;
    source.spellcheck = false;
    source.value = initialLatex;
    source.hidden = true;
    source.setAttribute("aria-label", "LaTeX source");

    wrapper.append(field, toggle, source);

    /**
     * MathLive nulls its keyboard delegate when the element is disconnected,
     * and its focus() does not guard against that — so a focus call that
     * races a teardown throws. Never let that reach the editor.
     */
    const focusField = () => {
      if (!field.isConnected) {
        return;
      }
      try {
        field.focus();
      } catch {
        // disposed mid-flight; the session is already closing
      }
    };

    const currentSession = () => {
      const session = view.state.field(mathSessionField, false) ?? null;
      return session && session.id === this.session.id ? session : null;
    };

    /** Write LaTeX into the document without touching history (the exit commits one step). */
    const writeToDocument = (latex: string) => {
      const session = currentSession();
      if (!session) {
        return;
      }
      const content = wrap(latex);
      if (view.state.doc.sliceString(session.contentFrom, session.contentTo) === content) {
        return;
      }
      view.dispatch({
        changes: { from: session.contentFrom, to: session.contentTo, insert: content },
        annotations: [Transaction.addToHistory.of(false), Transaction.userEvent.of("input.math")],
      });
    };

    const exit = (placeCursor: "after" | "before" | "keep") => {
      const session = currentSession();
      if (!session) {
        return;
      }

      const { originalLatex, display } = session;
      const delimiters = display ? 2 : 1;
      const latex = normalizeLatex(field.value.trim());
      const nextChar = view.state.doc.sliceString(session.to, session.to + 1);

      // Empty formula: remove the delimiters too. A stray `$$` alone on a
      // line would otherwise become a display-math fence that swallows the
      // following paragraph on the server.
      if (!latex) {
        view.dispatch({
          changes: { from: session.from, to: session.to, insert: "" },
          effects: exitMath.of(null),
          ...(placeCursor === "keep" ? {} : { selection: { anchor: session.from } }),
        });
        view.focus();
        return;
      }

      const finalContent = wrap(latex);
      const afterRegion = session.from + delimiters + finalContent.length + delimiters;
      const cursor =
        placeCursor === "before"
          ? session.from
          : display && nextChar === "\n"
            ? afterRegion + 1
            : afterRegion;
      const selection =
        placeCursor === "keep" ? {} : { selection: { anchor: cursor }, scrollIntoView: true };

      // Two transactions, one history entry: silently restore the original
      // content, then apply the final LaTeX with history on. Ctrl+Z then
      // reverts the whole session at once. (A single multi-spec dispatch
      // could not do this — it composes into one change with one history
      // setting.)
      const current = view.state.doc.sliceString(session.contentFrom, session.contentTo);
      if (current !== originalLatex) {
        view.dispatch({
          changes: { from: session.contentFrom, to: session.contentTo, insert: originalLatex },
          annotations: Transaction.addToHistory.of(false),
        });
      }

      if (finalContent !== originalLatex) {
        view.dispatch({
          changes: {
            from: session.contentFrom,
            to: session.contentFrom + originalLatex.length,
            insert: finalContent,
          },
          effects: exitMath.of(null),
          annotations: Transaction.userEvent.of("input.math"),
          ...selection,
        });
      } else {
        view.dispatch({ effects: exitMath.of(null), ...selection });
      }
      view.focus();
    };

    for (const type of STOP_PROPAGATION_EVENTS) {
      wrapper.addEventListener(type, (event) => event.stopPropagation());
    }

    field.addEventListener("input", () => {
      writeToDocument(field.value);
      if (!source.hidden) {
        source.value = field.value;
      }
    });

    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (event.key === "Escape" || (event.key === "Enter" && plain)) {
        event.preventDefault();
        exit("after");
      } else if (event.key === "Tab") {
        event.preventDefault();
        exit(event.shiftKey ? "before" : "after");
      }
    });

    field.addEventListener("move-out", (event) => {
      const detail = (event as CustomEvent<{ direction: string }>).detail;
      event.preventDefault();
      exit(detail?.direction === "backward" || detail?.direction === "upward" ? "before" : "after");
    });

    toggle.addEventListener("mousedown", (event) => event.preventDefault());
    toggle.addEventListener("click", () => {
      const show = source.hidden;
      source.hidden = !show;
      toggle.setAttribute("aria-pressed", show ? "true" : "false");
      if (show) {
        source.value = field.value;
        source.focus();
      } else {
        focusField();
      }
    });

    source.addEventListener("input", () => {
      field.setValue(source.value, { silenceNotifications: true });
      writeToDocument(source.value);
    });
    source.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        exit("after");
      }
    });

    // Clicking elsewhere in the note commits the formula but leaves the
    // cursor wherever the click put it. `relatedTarget` is not usable here:
    // when MathLive moves focus into its shadow-DOM keyboard sink, Firefox
    // reports it as null across the shadow boundary, which looked like
    // "focus left" and tore the field down mid-focus. `document.activeElement`
    // reports the shadow host, so check that once focus has settled.
    wrapper.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!wrapper.isConnected) {
          return;
        }
        const active = document.activeElement;
        if (active && wrapper.contains(active)) {
          return; // still inside: the field's host, the toggle, or the textarea
        }
        exit("keep");
      }, 0);
    });

    if (lastFocusedSessionId !== this.session.id) {
      lastFocusedSessionId = this.session.id;
      // MathLive creates its internals in connectedCallback and announces
      // them with "mount"; focusing before that is a no-op, after a teardown
      // it throws. The frame fallback covers a build without the event.
      field.addEventListener("mount", focusField, { once: true });
      requestAnimationFrame(focusField);
    }

    return wrapper;
  }
}
