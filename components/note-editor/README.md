# Note editor

Markdown + LaTeX editor for the note body. The markdown string is the source
of truth (see `docs/note-editor-requirements.md`); nothing here converts to or
from a block document.

- `note-editor.tsx` — public `NoteEditor`. Owns the draft, autosave, and the
  save-status pill. Loads the CodeMirror host with `next/dynamic` (`ssr: false`).
- `markdown-editor.tsx` — the CodeMirror 6 host. DOM-only, no app state.
- `use-autosave.ts` — debounced, coalescing, single-flight save queue that
  re-queues on failure.
- `extensions/theme.ts` — editor chrome and Markdown typography on the app's
  CSS variables.

Mounted from `app/notes/notes-workspace.tsx`; the workspace owns the title,
sidebar, and CRUD.
