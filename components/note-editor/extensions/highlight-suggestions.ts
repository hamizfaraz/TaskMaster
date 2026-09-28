import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
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

/**
 * Suggestions from the agent, which carry a reason and are set from outside
 * rather than derived from the text. They are kept in their own field so the
 * two layers cannot fight: the ranker recomputes on every edit, the agent's
 * stand until asked again.
 */
export type ExternalSuggestion = { from: number; to: number; text: string; reason: string };

export const setAgentSuggestions = StateEffect.define<ExternalSuggestion[]>();

export const agentSuggestionField = StateField.define<ExternalSuggestion[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setAgentSuggestions)) {
        return effect.value;
      }
    }
    // Offsets shift as the document changes; drop any that no longer match.
    if (!transaction.docChanged) {
      return value;
    }
    const doc = transaction.newDoc;
    return value
      .map((suggestion) => ({
        ...suggestion,
        from: transaction.changes.mapPos(suggestion.from),
        to: transaction.changes.mapPos(suggestion.to),
      }))
      .filter((suggestion) => doc.sliceString(suggestion.from, suggestion.to) === suggestion.text);
  },
});

const agentMark = (suggestion: ExternalSuggestion) =>
  Decoration.mark({
    class: "cm-note-suggestion cm-note-suggestion-agent",
    attributes: {
      title: `${suggestion.reason} — click to highlight`,
      "data-suggestion": "true",
    },
  });

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

  // The agent's spans win where the two overlap: they carry a reason, and a
  // reason is more use than a dotted line.
  const agent = view.state.field(agentSuggestionField, false) ?? [];
  const ranked = detectHighlightSuggestions(markdown).filter(
    (suggestion) => !agent.some((other) => suggestion.from < other.to && suggestion.to > other.from),
  );

  const all = [
    ...agent.map((suggestion) => ({ ...suggestion, mark: agentMark(suggestion) })),
    ...ranked.map((suggestion) => ({ ...suggestion, mark: suggestionMark(suggestion) })),
  ].toSorted((a, b) => a.from - b.from);

  const builder = new RangeSetBuilder<Decoration>();
  for (const suggestion of all) {
    if (suggestion.from < suggestion.to && suggestion.to <= view.state.doc.length) {
      builder.add(suggestion.from, suggestion.to, suggestion.mark);
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
      const agentChanged = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setAgentSuggestions)),
      );
      if (update.docChanged || agentChanged) {
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
  // The agent's suggestions read differently because they carry a reason.
  ".cm-note-suggestion-agent": {
    textDecoration: "underline dashed",
    backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
  },
});

/** Enabled only while the user has asked to see suggestions. */
export function highlightSuggestions(enabled: boolean): Extension {
  return enabled ? [agentSuggestionField, suggestionPlugin, suggestionTheme] : [];
}

/** How many points the text currently suggests. Drives the toggle's label. */
export function countSuggestions(markdown: string) {
  return detectHighlightSuggestions(markdown).length;
}
