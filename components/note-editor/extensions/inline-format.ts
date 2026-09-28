import { EditorSelection, type ChangeSpec, type StateCommand } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/**
 * Bold and italic for a Markdown editor.
 *
 * Without this the only way to emphasise text was to type the asterisks by
 * hand, and `Mod-i` was worse than missing: CodeMirror's `defaultKeymap` binds
 * it to `selectParentSyntax`, so the familiar shortcut did something
 * unrelated. These bindings are installed at a higher precedence so they win.
 */

/** Toggle `marker` around each selected range, or at the cursor. */
export function toggleInlineMarker(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    const ranges = state.selection.ranges.map((range) => {
      const before = state.doc.sliceString(
        Math.max(0, range.from - marker.length),
        range.from,
      );
      const after = state.doc.sliceString(
        range.to,
        Math.min(state.doc.length, range.to + marker.length),
      );

      // Already wrapped: peel the markers off rather than nesting them.
      if (before === marker && after === marker) {
        changes.push(
          { from: range.from - marker.length, to: range.from, insert: "" },
          { from: range.to, to: range.to + marker.length, insert: "" },
        );
        return EditorSelection.range(range.from - marker.length, range.to - marker.length);
      }

      const selected = state.doc.sliceString(range.from, range.to);
      if (selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
        changes.push({
          from: range.from,
          to: range.to,
          insert: selected.slice(marker.length, selected.length - marker.length),
        });
        return EditorSelection.range(range.from, range.to - marker.length * 2);
      }

      changes.push(
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      );
      // An empty selection lands the cursor between the markers, ready to type.
      return range.empty
        ? EditorSelection.cursor(range.from + marker.length)
        : EditorSelection.range(range.from + marker.length, range.to + marker.length);
    });

    if (changes.length === 0) {
      return false;
    }

    dispatch(
      state.update({
        changes,
        selection: EditorSelection.create(ranges, state.selection.mainIndex),
        userEvent: "input.format",
        scrollIntoView: true,
      }),
    );
    return true;
  };
}

export const toggleBold = toggleInlineMarker("**");
export const toggleItalic = toggleInlineMarker("*");
export const toggleInlineCode = toggleInlineMarker("`");
export const toggleStrikethrough = toggleInlineMarker("~~");
/** Obsidian's `==highlight==`. Read back by `lib/notes/highlights.ts`. */
export const toggleHighlight = toggleInlineMarker("==");

/**
 * Installed with `keymap.of` ahead of `defaultKeymap` so `Mod-i` reaches
 * italics instead of `selectParentSyntax`.
 */
export function inlineFormatKeymap() {
  return keymap.of([
    { key: "Mod-b", run: toggleBold, preventDefault: true },
    { key: "Mod-i", run: toggleItalic, preventDefault: true },
    // Mod-e belongs to the math field (see extensions/math-widgets.ts).
    { key: "Mod-Shift-c", run: toggleInlineCode, preventDefault: true },
    { key: "Mod-Shift-x", run: toggleStrikethrough, preventDefault: true },
    { key: "Mod-Shift-h", run: toggleHighlight, preventDefault: true },
  ]);
}
