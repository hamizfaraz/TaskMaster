# Note editor

Markdown + LaTeX editor for the note body. The markdown string is the source
of truth (see `docs/note-editor-requirements.md`); nothing here converts to or
from a block document.

- `note-editor.tsx` — public `NoteEditor`. Owns the draft, autosave, and the
  save-status pill. Loads the CodeMirror host with `next/dynamic` (`ssr: false`).
- `markdown-editor.tsx` — the CodeMirror 6 host. DOM-only, no app state.
- `block-menu.tsx` — the "+" in the left gutter beside the cursor's line, a
  mouse-driven counterpart to the `/` menu. It applies the same
  `slashCommands` at the cursor through the editor's imperative handle; the
  host reports the line's position via `onActiveLineChange`.
- `use-autosave.ts` — debounced, coalescing, single-flight save queue that
  re-queues on failure.
- `extensions/theme.ts` — editor chrome and Markdown typography on the app's
  CSS variables.
- `extensions/live-preview.ts` — Obsidian-style live preview: hides syntax
  and renders bullets, checkboxes, rules, images and `==highlight==` on lines
  the cursor is not on.
- `extensions/table-widgets.ts` — StateField that renders GFM tables as an
  editable grid with row/column/alignment controls. The markdown is never shown
  in preview; Source mode is the only way to see it, and the range is atomic so
  the cursor steps over it. Clicking a cell swaps its rendering for an `<input>`
  holding that cell's raw markdown; typing writes only that cell's span of the
  document, while structural edits rewrite the whole region. The edits themselves
  are pure functions in `lib/notes/table-edit.ts`.
- `extensions/katex-render.ts` — cached `katex.renderToString`, shared by the
  math and table widgets.
- `extensions/math-widgets.ts` — StateField that renders math regions with
  KaTeX, or with a MathLive field for the region being edited; `Mod-e` and
  clicking a formula open it.
- `extensions/math-field-widget.ts` — the CodeMirror ↔ MathLive bridge:
  session state, edits written back without history, one undo step per
  session, exit rules, and the LaTeX source toggle.
- `extensions/mathlive-loader.ts` — loads MathLive on first use and waits for
  the custom element to be defined.

Math regions are found by the shared scanner in `lib/notes/math-ranges.ts`,
which the server uses for the same purpose, so what renders as math is
exactly what gets normalized on save.

Mounted from `app/notes/notes-workspace.tsx`; the workspace owns the title,
sidebar, and CRUD.
