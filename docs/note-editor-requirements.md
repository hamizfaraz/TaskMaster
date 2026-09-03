# Note Editor — Requirements

Status: **collecting requirements.** The previous Editor.js-based editor was
removed (see [Background](#background)); nothing has been chosen or built yet.

Requirements go in the section below as they are given. Everything after it is
verified context about the codebase as it stands today — constraints the
rebuild has to live within, not decisions that have been made.

---

## 1. Requirements

> _Awaiting input. Each requirement gets an ID (`NE-1`, `NE-2`, …) so it can be
> referenced from issues, commits, and tests._

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
|    |             |          |       |

### Notes / detail

_(Longer explanation for any requirement that needs more than a table row.)_

---

## 2. Open questions

_(Things that need a decision before or during the build.)_

| # | Question | Blocking? | Resolution |
|---|----------|-----------|------------|
|   |          |           |            |

---

## Background

The prior editor was a ~4,200-line custom shell around Editor.js
(`components/note-editor/`), removed on the `develop` working tree along with
its 1,100 lines of CSS and the `@editorjs/*`, `mathlive`, `mermaid`, and
`highlight.js` dependencies.

To restore it for reference: `git checkout -- components/note-editor`
(scope the path — do not use a blanket `git checkout .`, it would revert
unrelated uncommitted work).

What it did, for reference when deciding what to keep:

- Editor.js core with paragraph / header / list / quote / image tools
- Custom block tools for `code`, `mermaid`, and `math` (MathLive)
- Marquee (rubber-band) block selection, multi-block drag reorder with live
  drop indicator, multi-block copy/cut/paste
- Custom slash menu and right-click block menu
- 180 ms debounced autosave with a single-flight save queue
- A DOM-reconciliation step on save to preserve empty paragraphs, which
  Editor.js drops from its own output

---

## Where it plugs in

`app/notes/notes-workspace.tsx:1411` (marked `SEAM:`). The workspace still owns
note CRUD, the sidebar, class grouping, and the title input — the editor is
only responsible for the note **body**.

Contract the seam expects:

- **Receives** `selectedNote.content.document` (a `NoteDocument`)
- **Persists** via `saveNote(selectedNote.id, { title, content })`
- Must not save while `isTempNote(id)` is true (optimistic-create guard)

Currently the seam renders `selectedNote.content.markdown` read-only so notes
stay viewable until the replacement lands.

---

## Data layer (kept — this is the contract)

`lib/notes/` survived the removal and is what the API, DB, and AI generation
all speak. It is now **editor-agnostic**: `types.ts` used to import
`OutputBlockData`/`OutputData` from `@editorjs/editorjs` and now defines an
equivalent `NoteBlockShape` locally, so any editor may be used.

| Module | Role |
|--------|------|
| `types.ts` | `NoteDocument` / `NoteBlock` Zod schemas — the stored format |
| `parse-markdown.ts` | Markdown → note blocks |
| `markdown.ts` | Note blocks → Markdown (uses `turndown`) |
| `records.ts` | DB row ⇄ `NoteContent` |
| `persistence.ts` | Used by `/api/notes` and `/api/notes/[id]` |
| `generation.ts` | AI note generation from uploads (`/api/notes/upload`) |

`NoteContent` is `{ markdown: string; document: NoteDocument }` — both
representations are stored, and the markdown form is what feeds embeddings,
flashcards, and quizzes.

**Block types currently in the schema:** `paragraph`, `header`, `list`,
`quote`, `code`, `mermaid`, `image`, `math`.

A new editor does not have to support all of these, but changing or dropping a
block type means deciding what happens to notes already stored in that shape.
Current DB state: **58 notes, 0 using math blocks.**

---

## Constraints that already apply

From `AGENTS.md` — these hold regardless of what is chosen:

- **§1** Every async operation needs loading, error, and success states. Toasts
  via `sonner` for API results; never render raw API errors or Zod issues.
- **§2** The shell is `h-screen overflow-hidden`. The editor must scroll inside
  its own `min-h-0 flex-1 overflow-y-auto` container, never the page body.
- **§7** Semantic tokens only (`bg-surface`, `text-foreground`, …). Must work
  in light and dark mode.
- **§9** Extract and reuse components; do not duplicate markup.
- **§10** Derive state during render, not in effects. Event handlers over
  effects for interaction. `useRef` for transient values. Dynamic-import heavy
  libraries with `ssr: false`.
- **§12** Reuse the `MarkdownText` pattern (ReactMarkdown + `remark-gfm` +
  `remark-math` + `rehype-katex`) for LaTeX. Do not add a second math renderer.

**Still installed and available:** `zod` v4, `sonner`, `lucide-react`,
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`, `katex`,
`turndown` + `turndown-plugin-gfm`, `radix-ui` (installed, unused in app code).

**Removed — would need re-adding:** `@editorjs/*`, `mathlive`, `mermaid`,
`highlight.js`.

---

## Known issues this rebuild touches

| Issue | Relevance |
|-------|-----------|
| [#58](https://github.com/hamizfaraz/TaskMaster/issues/58) | Normalize all math input to LaTeX — the old block stored `{ latex }` via MathLive |
| [#86](https://github.com/hamizfaraz/TaskMaster/issues/86) | Editor images were base64-inlined into `note.content` jsonb; needs blob storage |
| [#7](https://github.com/hamizfaraz/TaskMaster/issues/7) | Detect definitions/formulas and highlight them; multi-topic split suggestions |
| [#8](https://github.com/hamizfaraz/TaskMaster/issues/8) | Mind map builder from note content |
| [#89](https://github.com/hamizfaraz/TaskMaster/issues/89) | Flashcard generation should prioritize highlighted sections |

`#7`, `#8`, and `#89` all depend on the editor exposing *highlights* in some
retrievable form — worth settling early, since it affects the block schema.
