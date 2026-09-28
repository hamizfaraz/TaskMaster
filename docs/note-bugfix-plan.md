# Note feature set — bug fix plan

Bugs only. Missing features are out of scope here and stay in
[note-features-fix-plan.md](./note-features-fix-plan.md) §2, which this plan is
meant to run before.

Branch: `fix/note-features-audit`. Every step is one commit ending green on
`tsc --noEmit`, `eslint`, and `vitest run`.

Findings marked **verified** were reproduced by running code against the 58
real notes in the development database. Findings marked *designed* are fixes I
have reasoned about but not yet executed.

---

## Phase 0 — data corruption (do this first)

The `markdown` column is canonical; the block document in `content` is a derived
cache. Round-tripping the 37 real notes with markdown through
`markdown → blocks → markdown` currently fails for 34 of them.

### Step 1 — land the regression harness before any fix

Add `lib/notes/__tests__/round-trip.test.ts` with a checked-in fixture of
anonymised real notes (structure preserved, wording replaced). Assert
`serialize(parse(x)) === x`, allowing only two normalisations that are agreed to
be intentional:

- `*   item` → `- item` (canonical list marker)
- a blank line inserted after a heading

Also assert the two counters directly, because they are the sharpest signal:
bold markers preserved, and no `$$` fence appearing that was not in the input.

This test must **fail on today's code**. That is the point of landing it first.

### Step 2 — stop running the legacy LaTeX detector over the markdown path

**This one line fixes both high-severity corruption bugs. Verified.**

`lib/notes/parse-markdown.ts:355` ends the markdown parser with:

```ts
return normalizeNoteLatexRegions({ time: Date.now(), blocks });
```

`normalizeNoteLatexRegions` is an Editor.js-era normaliser whose job was to find
*undelimited* LaTeX inside rich text. The markdown path does not need it: math
arrives already delimited as `$…$` and `$$…$$`, and `renderInlineMarkdownText`
has already wrapped it correctly. Running it anyway does two destructive things.

**Bug D1 — inline formatting destroyed on any line containing math.** The
normaliser calls `richTextToPlainText`, which strips every HTML tag, so
`<strong>` and `<em>` are lost. Across the 37 real notes this destroys
**166 bold markers**; several notes lose every one they had.

```
"Some **bold text** plain."           → "Some <strong>bold text</strong> plain."   ok
"Some **bold text** with $x^2$ math." → bold gone, paragraph split in three       broken
```

**Bug D2 — prose promoted to display-math blocks.** `isStandaloneLatexLine`
(`lib/notes/math-regions.ts:53`) promotes any line under 240 characters that has
one of `= + - * / ^ _ < >` and three or fewer words of three-plus letters. Over
the corpus it fires on **65 lines**, and inspection shows almost none of them
are standalone maths. Most are list items that merely *contain* inline maths:

```
"*   **Proposition.** $\mathbb{Q}$ is countable."   → wrapped in $$, bold lost, list lost
"\* \*\*Author:\*\* Robert W. Sebesta"              → "$$"  (author and ISBN destroyed)
"Highlight: ==key idea=="                            → "$$\nHighlight: ==key idea==\n$$"
"In C, a == b tests equality."                       → "$$\nIn C, a == b tests equality.\n$$"
```

Measured prose loss from this rule: **21 words across 4 notes**.

**The fix**: return the blocks unchanged.

```ts
return { time: Date.now(), blocks };
```

Keep `normalizeNoteLatexRegions` exported and keep it wired to
`normalizeNoteWriteContent`, the legacy path for clients that still send block
documents. Only the markdown path changes.

**Measured effect of this single change:**

| | before | after |
|---|---|---|
| bold markers lost | 166 | **0** |
| spurious `$$` fences added | 262 | **0** |
| strict round-trip failures | 34/37 | 32/37 |

The residual 32 are Step 3 and the two benign normalisations.

**Two existing tests fail and both encode the bug.** `parse-markdown.test.ts`
("normalizes inline and block math to LaTeX") and `persistence.test.ts`
("stores markdown as authored and derives the block cache from it") both assert
that a paragraph containing inline maths is **split into three blocks**
(`paragraph` + `inlineMath` + `paragraph`). That splitting is precisely what
tears the formatting apart. Update both to assert the correct shape: inline
maths stays inline, inside the paragraph's rich text, as the
`<span class="note-inline-math" data-latex="…">` that `renderInlineMarkdownText`
already produces. Nothing in the UI reads the block cache, so the shape change
is safe; serialisation back to `$…$` already works, which is why the round-trip
numbers above improve rather than regress.

### Step 3 — escaping and whitespace *(designed)*

**Bug D3.** Escaping is applied inconsistently and compounds across saves: 237
escape characters are added across the corpus while two notes *lose* escapes
(54 → 38, 20 → 14). Observed: `\geq` → `\\geq`, `[2]` → `\[2\]`.

**Bug D5.** Trailing whitespace is added and removed, which flips Markdown
hard-break semantics.

Escape only what Markdown actually requires in the position it occupies, and
leave trailing whitespace alone. Add the observed pairs as test cases, plus an
idempotence assertion: a second round-trip must equal the first.

### Step 4 — fix the legacy detector itself *(designed)*

`isStandaloneLatexLine` is still wrong for `normalizeNoteWriteContent`. Require
real evidence of maths rather than an ASCII operator: a LaTeX command
(`\[A-Za-z]+`), a non-ASCII maths symbol, or a sub/superscript, **and** nothing
resembling prose left once delimited maths, inline code, and list markers are
removed. Never promote a list item or a line containing a code span.

First confirm whether anything still sends block documents. If the legacy PATCH
branch (`app/api/notes/[id]/route.ts:74`) is dead, delete it and this whole
class of bug with it.

### Step 5 — backfill the 21 legacy notes

21 of 58 notes have block `content` but an empty `markdown` column.
`noteRecordToWorkspaceNote` (`lib/notes/records.ts:217-221`) falls back to
re-serialising the block cache for exactly those rows, so **those users see the
corruption today** (bug D4), and one keystroke promotes it to canonical.

Backfill with `serializeNoteDocumentToMarkdown` as a reviewed one-off script
with a dry-run mode that prints a diff per note. **Only after steps 2–4**, since
running it today would write every bug above permanently into the canonical
column.

---

## Phase 1 — backend correctness

### Step 6 — stop leaking internals, start logging (A1, **verified**)

`app/api/notes/upload/route.ts:99-109` returns `error.message` straight from the
catch, and there is **no `console.error` anywhere in `app/api/notes/`**. What
reaches the user's toast includes Zod 4 issue JSON (`ZodError.message` is a
serialised issues array), raw Azure Document Intelligence response bodies, and
environment-variable names such as `AZURE_KEY is missing`.

Apply the AGENTS.md §5 shape to every notes route:

```ts
} catch (error) {
  console.error("[POST /api/notes/upload]", error);
  return NextResponse.json({ error: "Could not generate notes from that file" }, { status: 502 });
}
```

The same anti-pattern exists at `app/api/quizzes/generate/route.ts:67` and
`app/api/quizzes/evaluate/route.ts:54`; sweep them in the same commit.

### Step 7 — make bulk actions honest (A2, A3, **verified**)

`app/notes/notes-workspace.tsx:765-782`:

```ts
await Promise.allSettled(
  ids.map((id) => !isTempNote(id) && fetch(`/api/notes/${id}`, { method: "DELETE" })),
);
// On partial failure we could restore, but for now just log
```

`fetch` resolves on 4xx and 5xx, `response.ok` is never checked, and nothing
logs despite the comment. Select five notes, have three DELETEs fail, and all
five vanish silently and are back on reload. The single-delete path at `:519-531`
already does this correctly; make the bulk paths match.

Same commit: bulk delete must refuse temp ids the way single delete does,
otherwise deleting a pulsing new note removes it from the list and
`createNoteOnServer` re-adds it moments later, permanently persisted. Class
moves (`:716-729`) and bulk move (`:839-843`) must roll back optimistic state
and toast rather than swallowing into `console.error`.

### Step 8 — protect the expensive path (A4, *designed*)

`app/api/notes/upload/route.ts:111-141` has no try/catch around the insert, so a
connection blip discards 30–90 seconds of paid Azure and Gemini work with a
generic 500 and no log. Add the guard, export `maxDuration`, put an
`AbortSignal` on the Azure poll (`generation.ts:93` polls up to 60 times), and
reject on `Content-Length` before `req.formData()` buffers the whole body.

Note two related weaknesses to decide on rather than silently accept: accepted
types are matched against the client-declared `file.type` with no magic-byte
sniffing, and an all-whitespace topic list can reach
`db.insert(note).values([])`, which throws unlogged.

### Step 9 — stop destroying provenance and staleness signals (A5, *designed*)

`app/api/notes/[id]/route.ts:69,77` replace the whole `content` jsonb with the
freshly parsed block document. Uploaded notes keep their provenance in that same
column (`noteGeneration`: source file, topic index, original markdown, embedding
snapshot). Typing one character into a generated note destroys it permanently.
Merge into `content` instead of replacing it.

### Step 10 — unpoison the autosave queue (A6, *designed*)

`components/note-editor/use-autosave.ts:72-97` re-queues a failed save and
breaks the loop. Nothing removes the entry for a note that no longer exists, so
deleting a note mid-debounce leaves a permanently failing entry: every later
flush retries it, toasts "Could not save note", and leaves the badge on
"Save failed" even though the note actually being edited saved fine. Give the
workspace a way to drop a deleted note's queue entry.

### Step 11 — small correctness cleanups (A7, A8, *designed*)

Duplicate copies `source.content.markdown` (`notes-workspace.tsx:559`), which
lags the editor by the debounce, so duplicating within ~200 ms of typing loses
the last paragraph. Read from the autosave hook's live text instead. Stop
shipping 768-float embeddings to the client where nothing reads them
(`app/(app)/notes/page.tsx:31`, roughly 1.5 MB at 100 notes). Cap imported
markdown length.

---

## Phase 2 — embeddings

### Step 12 — embed on save (E1, **verified**)

| source | total | embedded | stale after edit | text but no embedding |
|---|---|---|---|---|
| manual | 7 | **0** | 0 | 0 |
| upload | 51 | 47 | **5** | 2 |

Embeddings are computed only at upload. The PATCH route never touches the
column (`grep -c embedding` returns 0). So no hand-written note has ever been
embedded, and every note authored in the new editor is invisible to flashcard
and quiz generation, which filter on `hasEmbedding`. Five uploaded notes were
edited afterwards and now carry a vector describing their previous text, while
the picker still shows "Embedding ready".

Compute on create and on update, debounced and only when the text actually
changed, backfill the notes that lack one, and surface staleness in the picker
instead of claiming readiness.

---

## Phase 3 — regressions from the editor rebuild

### Step 13 — code highlighting, and a doc that lies (R1, **verified**)

`extensions/theme.ts:54-79` defines only markdown tags: no `keyword`, `string`,
`comment`, or `number`. `defaultHighlightStyle` is never installed and
`app/globals.css` has no `.tok-*` rules, so code fences parse into a language
tree that nothing styles and render in one flat colour.
`docs/note-editor-requirements.md` asserts the opposite in two places (the
known-limitations list and Q6). Install
`syntaxHighlighting(defaultHighlightStyle, { fallback: true })` and correct the
doc. Fix R6 in the same pass: the doc header says "Status: **built.** All nine
requirements are implemented" and then "nothing has been chosen or built yet".

### Step 14 — resolve the mermaid dead end (R2, **verified**)

`lib/notes/generation.ts` still instructs the model to emit ```` ```mermaid ````
fences; the parser and serializer still round-trip a `mermaid` block type; the
`mermaid` dependency is gone and no renderer exists anywhere. **0 notes are
affected today**, so this is latent. It needs a product decision (below), then
one commit making the code consistent either way.

### Step 15 — inline formatting (R3, **verified**)

There is no toolbar, no `Mod-b`, and `defaultKeymap` binds `Mod-i` to
`selectParentSyntax`, so the familiar shortcut actively does something else.
Bold and italics can only be applied by typing asterisks. Add `Mod-b` / `Mod-i`,
rebind the conflict, and add a small selection toolbar. Issue #6 is closed with
this acceptance criterion unmet.

---

## Decisions needed

1. **Mermaid: restore the renderer or remove the feature?** The deleted
   `mermaid-renderer.ts` is about 34 lines and recoverable from `42df3f0`.
   Restoring costs a dependency; removing means deleting the generator
   instruction and the block type. No existing data is affected either way.
2. **Block drag-to-reorder (R4):** restore roughly 570 removed lines, or accept
   its loss as an intentional simplification of a Markdown-native editor?
3. **Read-only note renderer (R5):** notes can currently only be viewed inside
   the editor. Add one, or record that the editor is the only view?
4. **Scope.** Phase 0 alone is the defensible minimum and stops live data
   corruption. Phases 0–2 are twelve commits and fix everything that damages
   data or lies to the user.

---

## Not bugs

Recorded so they are not re-litigated:

- **Per-user scoping is clean.** Every read and write filters on
  `session.user.id`, and `classId` always goes through
  `assertClassBelongsToUser`. Guessing another user's note id returns 404.
- `*   ` → `- ` list-marker normalisation and the blank line inserted after
  headings are intentional canonical form.
- An early measurement suggested 172 words lost in the round-trip. That counted
  letters inside LaTeX commands, which legitimately change under
  `normalizeLatex`. The real figure is 21 words across 4 notes.
