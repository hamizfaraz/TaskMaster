# Note editor

Markdown + LaTeX editor for the note body. The markdown string is the source
of truth (see `docs/note-editor-requirements.md`); nothing here converts to or
from a block document.

- `note-editor.tsx` — public `NoteEditor`. Owns the draft, autosave, and the
  save-status pill. Loads the CodeMirror host with `next/dynamic` (`ssr: false`).
- `markdown-editor.tsx` — the CodeMirror 6 host. DOM-only, no app state.
- `block-menu.tsx` — the "+ Block" button: a mouse-driven counterpart to the
  `/` menu that applies the same `slashCommands` at the cursor through the
  editor's imperative handle.
- `use-autosave.ts` — debounced, coalescing, single-flight save queue that
  re-queues on failure.
- `extensions/theme.ts` — editor chrome and Markdown typography on the app's
  CSS variables.
- `extensions/live-preview.ts` — Obsidian-style live preview: hides syntax
  and renders bullets, checkboxes, rules, images and `==highlight==` on lines
  the cursor is not on.
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
