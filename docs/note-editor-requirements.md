# Note Editor — Requirements

Status: **built.** All nine requirements are implemented and covered by tests;
see [Built](#built) for where each one lives and how to verify it by hand. The previous Editor.js-based editor was removed on this branch
(see [Background](#background)); nothing has been chosen or built yet.

Section 1 is what was asked for. Section 2 is what has to be decided before
building. Everything after that is verified context about the codebase as it
stands today — constraints the rebuild has to live within, not decisions.

---

## 1. Requirements

Each requirement has an ID (`NE-1`, `NE-2`, …) so it can be referenced from
issues, commits, and tests. Priority is **Must** unless stated otherwise.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| NE-1 | All note text is **Markdown + LaTeX**. No proprietary rich-text format. | Must | Implies Markdown is the canonical representation — see Q1. |
| NE-2 | LaTeX is embedded in the Markdown **exactly as the note generator emits it**: `$…$` inline, `$$` on its own lines for display. | Must | Format pinned in detail below. |
| NE-3 | The editor works **seamlessly with generator output**: a generated note opens, edits, and saves with no lossy transform in either direction. | Must | Round-trip must be lossless. One known defect today — see detail. |
| NE-4 | While typing, the user can **insert a block of any Markdown type**. | Must | Full list in detail. Tables are a gap today. |
| NE-5 | While typing, the user can **insert a math block**, choosing **inline** or **display ("large")**. | Must | Maps directly onto the data layer's `inlineMath` / `math` block types. |
| NE-6 | Take **direct inspiration from Obsidian**. | Must | Markdown-native typing, live preview, `$`/`$$` math syntax. See Q4 on modes. |
| NE-7 | A math block gets a **Desmos / Mathway-style structural input**: the user types characters naturally *or* edits the LaTeX directly, and the two stay in sync. | Must | `lib/math/latex.ts` already normalizes typed math → LaTeX. See detail. |
| NE-8 | **Backspace in a math block deletes structural elements whole** — a fraction, a root, a superscript — not one character at a time. | Must | This is a structural (not character) editing model. Decides the math engine — Q2. |
| NE-9 | A **proper, intuitive, fully featured** note editor — a real editor, not a textarea with a preview. | Must | Quality bar. What this means concretely is in detail. |

### Notes / detail

#### NE-2 — the generator format (pinned)

Verified by running `rewriteParsedTextAsMarkdown` live against Gemini on this
branch. This is what the editor has to accept and produce:

```markdown
Proof Suppose finitely many $p_1..p_n$. Consider $N = p_1*...*p_n + 1$.
The area of a circle is $A = \pi r^2$ and the sum is $x_1 + x_2$.

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

- **Inline:** single `$…$`, on the same line as surrounding prose.
- **Display:** `$$` alone on a line, the LaTeX, `$$` alone on a line.
  `parse-markdown.ts` treats a bare `$$` line as a block boundary
  (`isBlockStartLine`), so the fence-on-its-own-line form is load-bearing.
- The generator is instructed *"Do not attempt to interpret or rewrite math
  expressions"* — so raw, sometimes non-idiomatic LaTeX (`p_1*...*p_n`) will
  arrive and must render as-is rather than be "fixed".

The data layer already distinguishes the two: `lib/notes/math-regions.ts`
converts `$…$` into `inlineMath` blocks and `$$` regions into `math` blocks.

#### NE-3 — seamless round-trip

"Seamless" means `markdown → editor → markdown` is the identity for anything
the generator can produce. There **was** one defect in the data layer that
violated this (now fixed — see Q5):

```
"The sum is $x_1 + x_2$."      →  "The sum is $x_1 + x_2$ ."
"Values: $a$, $b$, and $c$."   →  "Values: $a$ , $b$ , and $c$ ."
```

Inline math followed by `.` `,` `!` `?` gains a spurious space on
serialization. It is idempotent (stable after the first pass, so it does not
compound through autosave) but it degrades the `markdown` column, which feeds
embeddings, flashcards, and quizzes.

Root cause: inline math is its own **block** (`inlineMath`), so one sentence
with two formulas becomes five blocks (`paragraph, inlineMath, paragraph,
inlineMath, paragraph`) and re-joining inserts a space. This is a consequence
of the block design, not a stray bug — the rebuild should either fix the join
or represent inline math *within* a paragraph. See Q1.

#### NE-4 — block types

Everything the generator is instructed to emit (`lib/notes/generation.ts`,
the rewrite prompt), so all of these must be insertable and editable:

| Markdown construct | Data-layer block today | Status |
|---|---|---|
| Paragraph | `paragraph` | ✓ |
| Heading `#`–`####` | `header` | ✓ |
| Bullet / numbered / checklist | `list` | ✓ |
| Blockquote `>` | `quote` | ✓ |
| Fenced code | `code` | ✓ (highlighter removed — Q6) |
| Image `![alt](url)` | `image` | ✓ storage is base64 — #86 |
| Inline math `$…$` | `inlineMath` | ✓ spacing defect — NE-3 |
| Display math `$$` | `math` | ✓ |
| Mermaid fenced block | `mermaid` | schema only; renderer removed — Q6 |
| **Table** | **none** | **gap** — Q3 |

The generator prompt says *"Convert all parsed tables into Markdown tables"*,
but `parse-markdown.ts` has no table detection and the schema has no table
block, so a generated table currently degrades to a paragraph of pipe
characters. This is the largest NE-3 violation.

Also required by "any Markdown type" but not emitted by the generator:
horizontal rule, and inline formatting (`**bold**`, `*italic*`, `` `code` ``,
`~~strike~~`, links). `renderInlineMarkdownText` already handles the inline
set.

#### NE-7 / NE-8 — structural math editing

These two together define the editing *model* for math, and it is not a
character model. In a character model, backspace after `\frac{a}{b}` deletes
`}`. In a structural model, the cursor is *inside* a fraction object and
backspace removes the fraction as a unit (or steps out of it) — which is what
Desmos and Mathway do and what NE-8 asks for.

Consequences:

- The math block needs a **structural editor**, not a text input with a
  preview. The rendered formula *is* the editing surface.
- NE-7's "or modify the LaTeX directly" means a second, synchronized view of
  the same structure — a LaTeX source toggle. Desmos does not offer one;
  Mathway's "show LaTeX" and MathLive's source mode do.
- Typed characters go through `normalizeLatex` (`lib/math/latex.ts`), which
  already maps `√(x²) ≤ π` → `\sqrt{x^2} \le \pi`. Reuse it rather than
  reimplement.
- **Desmos's input is MathQuill.** The editor that was just removed used
  MathLive, which has exactly this behaviour. See Q2 — the choice is between
  re-adopting MathLive, adopting MathQuill, or building it. Building a
  structural math editor from scratch is not a small task.

#### NE-9 — what "fully featured" means

Concretely, the bar the removed editor already met and this one must at
least match, plus what NE-1–NE-8 add:

- Keyboard-first: every block type insertable without the mouse. Obsidian
  does this by typing Markdown; a `/` menu is an addition, not a replacement.
- Undo/redo that treats a math block edit as one step.
- Copy/paste that preserves Markdown + LaTeX across notes and out to other
  apps — pasting into a plain text field yields valid Markdown.
- Autosave with visible saving / saved / error state (AGENTS.md §1). The old
  editor debounced 180 ms with a single-flight queue; keep that behaviour.
- Selection and reorder of whole blocks.
- Works in light and dark mode, inside the `h-screen overflow-hidden` shell
  (AGENTS.md §2, §7).
- Loads lazily — the math engine and any highlighter are `next/dynamic`
  with `ssr: false` (AGENTS.md §10).

---

## 2. Open questions

| # | Question | Blocking? | Resolution |
|---|----------|-----------|------------|
| Q1 | **Canonical storage format.** NE-1 says Markdown is the truth. Today *both* `note.markdown` and `note.content` (block jsonb) are stored and kept in sync. Does the block document stay as a derived cache, or go away? Keeping both means every edit is serialized twice and the two can drift — the NE-3 defect is exactly that drift. | **Yes** — decides the data model | **Markdown is canonical.** `POST/PATCH /api/notes` accept `markdown`; it is stored as authored (CRLF→LF, `normalizeTextMathToLatex`) and the `content` blocks are a derived cache via `parseMarkdownToNoteDocument`. Every client write path sends markdown. The editor edits the markdown string directly, so round-trip is the identity by construction. |
| Q2 | **Math engine** for NE-7/NE-8. (a) **MathLive** — was integrated until this branch removed it; structural editing, LaTeX source mode, virtual keyboard, actively maintained. (b) **MathQuill** — what Desmos actually uses; older, jQuery-era. (c) Build it. | **Yes** — NE-7/8 can't start without it | **MathLive.** Structural backspace (NE-8) is native, it has a LaTeX source view (NE-7), and the prior integration's CSS and pitfalls are documented. Loaded client-only; wait on `customElements.whenDefined("math-field")` before creating fields. |
| Q3 | **Tables.** Generator emits them; schema has no block; parser doesn't detect them. Add a `table` block + parser support, or store tables as raw Markdown inside a paragraph and render them? | **Yes** for NE-3/NE-4 | **Native GFM tables.** A `table` block was added to the data layer (parser detection, serializer, Zod; round-trip tested). In the editor a table is just markdown text; `remark-gfm` already renders it. |
| Q4 | **Obsidian mode.** Obsidian has *Live Preview* (Markdown renders in place as you type; syntax shows when the cursor is on it) and *Source mode* (raw text). NE-6 implies Live Preview. Is Source mode also required? | No — but shapes the architecture | **Live Preview on CodeMirror 6, plus a Source-mode toggle.** Obsidian is built on CM6; syntax is hidden on lines that don't contain the cursor and shown on the active line. |
| Q5 | **Inline math spacing** (the NE-3 defect). Fix the join in `math-regions.ts`, or change the model so inline math lives inside a paragraph rather than as a sibling block? Interacts with Q1. | No | **Both.** `getBlockSeparator` no longer inserts a space before closing punctuation or after an opening bracket (tested), *and* the edit path never serializes blocks anymore, so the defect cannot recur there. |
| Q6 | **Mermaid and code highlighting.** The generator emits both; both renderers were removed. Render them (re-add `mermaid` and a highlighter), or show as plain fenced code for now? | No | **Code highlighting yes** (`@codemirror/language-data`, lazy). **Mermaid deferred** — rendered as a plain fenced block for now; the `mermaid` block type stays so stored notes keep parsing. |
| Q7 | **Images** — #86. Uploads are base64-inlined into jsonb today. Blob storage is its own issue, but the image block should be built against a URL, not bytes. | No | **Build against a URL.** The editor takes an optional `uploadImage(file) → { url }` prop; until #86 lands, the fallback is a base64 data URL. |
| Q8 | **Highlights** — #7, #8, #89 all need the editor to expose highlighted regions. In scope for the first build, or a follow-on? Affects the block schema. | No | **Follow-on.** The editor styles Obsidian's `==highlight==` syntax and stores it as markdown, which gives #7 / #89 a retrievable hook without a schema change now. |
---

## Built

| Req | Where | Notes |
|-----|-------|-------|
| NE-1 | `lib/notes/persistence.ts` `normalizeNoteWriteMarkdown`; both `/api/notes` routes accept `markdown` | Markdown is stored as authored; the block document is derived from it. |
| NE-2 | `lib/notes/math-ranges.ts` (shared scanner) | `$…$` inline, `$$` on its own lines for display — the generator's exact shape. Pandoc's rule decides inline math. |
| NE-3 | Editor edits the markdown string directly; `math-ranges.test.ts`, `persistence.test.ts`, `table-block.test.ts` | Round-trip is the identity by construction. Code and prose are byte-for-byte untouched by normalization; the old `$x$ .` defect is fixed. |
| NE-4 | `extensions/slash-menu.ts` | `/` opens 14 commands: text, H1–H3, bullet/numbered/checklist, quote, code, table, image, divider, math block, inline math. Typing Markdown directly works too. |
| NE-5 | `/Math block` → `$$\n…\n$$`, `/Inline math` → `$…$`, both open the field immediately | |
| NE-6 | `extensions/live-preview.ts`, `extensions/math-widgets.ts`; Source/Preview toggle in `note-editor.tsx` | CodeMirror 6, which is what Obsidian is built on. Syntax hides off the active line; math renders with KaTeX. |
| NE-7 | `extensions/math-field-widget.ts` | MathLive field replaces the formula; the **LaTeX** button exposes a synchronized source textarea; `normalizeLatex` runs on exit. |
| NE-8 | `compoundElementBefore` in `extensions/math-field-widget.ts`: a capture-phase Backspace handler on the field | MathLive's own Backspace steps *into* a fraction. The handler walks `getElementInfo` depths to find the compound element before the caret, selects its whole subtree, and deletes it — a fraction, root, exponent, integral with limits, or matrix goes as a unit. Inside a branch, or after a plain symbol, MathLive's behaviour applies. |
| NE-9 | `use-autosave.ts`; one undo step per math session; `Mod-e` opens math; dark mode via tokens | Coalescing autosave with retry and a visible status pill; failed saves re-queue instead of dropping. |

### Verify by hand (`pnpm dev` → `/notes`)

1. Open an uploaded note, click **Source**: the body is exactly the stored
   markdown. Edit one character, undo it, wait for **Saved**, then compare
   `GET /api/notes/:id` `markdown` — identical bytes.
2. Type `/` on an empty line and insert each block type. Type `# `, `- `,
   `> ` directly and watch the marks hide when the cursor leaves the line.
3. Click a formula: a MathLive field opens. Type `\frac{a}{b}`, put the cursor
   after it, press Backspace — the fraction goes as a unit. Press Escape; the
   cursor lands after the region; Ctrl+Z reverts the whole edit at once.
4. Press **LaTeX** inside a field and edit the source — the rendering follows.
5. Kill the dev server, type: **Save failed · Retry** appears with a toast.
   Restart, press Retry — saved.
6. Toggle dark mode: the field, KaTeX, and slash menu stay legible.

### Known limitations

- MathLive was exercised in jsdom through a stub element; focus handling in
  real browsers (Safari especially) still needs the manual pass above.
- Tables render as monospace source in live preview, not as a grid widget.
- Mermaid fences render as plain code (the renderer was removed with the old
  editor); code fences highlight via `@codemirror/language-data`.
- Images inline as base64 until #86 lands (2 MB cap).
- `==highlight==` is styled in the editor only; `LatexMarkdown` shows it raw.

---

## Background

The prior editor was a ~4,200-line custom shell around Editor.js
(`components/note-editor/`), removed on this branch in commit `c687dc0` along
with its 1,100 lines of CSS and the `@editorjs/*`, `mathlive`, `mermaid`, and
`highlight.js` dependencies. `develop` still carries it.

To read it for reference without restoring it:
`git show develop:components/note-editor/note-editor.tsx` (or any file
under that path).

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

`app/notes/notes-workspace.tsx` mounts `<NoteEditor>` from
`components/note-editor/note-editor.tsx` below the title input. The workspace
still owns note CRUD, the sidebar, class grouping, and the title; the editor is
only responsible for the note **body**.

Contract:

- **Receives** `initialMarkdown={selectedNote.content.markdown}` — the
  markdown string is the document
- **Persists** via `onSave={(noteId, markdown) => saveNote(noteId, { markdown })}`
- `saveEnabled={!isTempNote(id)}` while the note is still being created;
  edits made in that window are held and saved under the real id afterwards
- Optional `uploadImage(file) → { url }` for dropped/pasted images
  (defaults to an inline data URL until #86)

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
`quote`, `code`, `mermaid`, `image`, `table`, `math`, `inlineMath`. Since Q1
the block document is a derived cache of the markdown column, not a source of
truth.

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

**Removed:** `@editorjs/*`, `mermaid`, `highlight.js`.
**Added for the rebuild:** `@codemirror/state`, `view`, `language`,
`commands`, `lang-markdown`, `language-data`, `autocomplete`, `@lezer/markdown`,
`@lezer/highlight`, and `mathlive` (re-added).

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
