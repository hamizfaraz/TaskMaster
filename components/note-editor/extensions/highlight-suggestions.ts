import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { detectHighlightSuggestions, type HighlightSuggestion } from "@/lib/notes/detect-highlights";

/**
 * Show the points a note's text suggests are worth marking, and let one be
 * accepted with a click.
 *
 * Detection is pure text work over the document the editor already holds, so
 * this runs in the browser with no request, no cost, and no delay. Nothing is
 * written until the user accepts: a suggestion is a dotted underline, a
 * highlight is a decision.
 */

const suggestionMark = (suggestion: HighlightSuggestion) =>
  Decoration.mark({
    class: "cm-note-suggestion",
    attributes: {
      title: `Suggested ${suggestion.kind} — click to highlight`,
      "data-suggestion": "true",
    },
  });

/** Wrap a suggested span in `==…==`. */
export function acceptSuggestion(view: EditorView, from: number, to: number) {
  const text = view.state.doc.sliceString(from, to);
  if (!text.trim()) {
    return false;
  }

  view.dispatch({
    changes: { from, to, insert: `==${text}==` },
    // Its own history entry: accepting a suggestion is one undoable action.
    userEvent: "input.highlight",
    selection: { anchor: from + text.length + 4 },
  });
  return true;
}

function buildDecorations(view: EditorView): DecorationSet {
  const markdown = view.state.doc.toString();
  // A very long document is not worth re-scanning on every keystroke; the
  // editor stays responsive and the user can still highlight by hand.
  if (markdown.length > 200_000) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const suggestion of detectHighlightSuggestions(markdown)) {
    if (suggestion.from < suggestion.to && suggestion.to <= view.state.doc.length) {
      builder.add(suggestion.from, suggestion.to, suggestionMark(suggestion));
    }
  }
  return builder.finish();
}

const suggestionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.("[data-suggestion]")) {
          return false;
        }

        const position = view.posAtDOM(target);
        const decorations = view.plugin(suggestionPlugin)?.decorations;
        if (!decorations) {
          return false;
        }

        let accepted = false;
        decorations.between(position, position + 1, (from, to) => {
          accepted = acceptSuggestion(view, from, to);
          return false; // stop at the first
        });

        if (accepted) {
          event.preventDefault();
        }
        return accepted;
      },
    },
  },
);

const suggestionTheme = EditorView.baseTheme({
  ".cm-note-suggestion": {
    cursor: "pointer",
    textDecoration: "underline dotted",
    textDecorationColor: "var(--accent)",
    textUnderlineOffset: "0.25em",
    backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)",
    borderRadius: "0.2em",
  },
  ".cm-note-suggestion:hover": {
    backgroundColor: "var(--accent-soft)",
  },
});

/** Enabled only while the user has asked to see suggestions. */
export function highlightSuggestions(enabled: boolean): Extension {
  return enabled ? [suggestionPlugin, suggestionTheme] : [];
}

/** How many points the text currently suggests. Drives the toggle's label. */
export function countSuggestions(markdown: string) {
  return detectHighlightSuggestions(markdown).length;
}
