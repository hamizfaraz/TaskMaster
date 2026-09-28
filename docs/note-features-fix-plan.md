# Note feature set — audit and fix plan

Branch: `fix/note-features-audit` (off `develop` @ `4c83bb0`).

Every finding below was verified by reading the code and, where possible, by
executing it against the 58 real notes in the development database. Claims that
turned out to be measurement artefacts are marked as such and excluded.

Counts used throughout: **58 notes** (7 manual, 51 upload), **37** with non-empty
`markdown`, **21** with block `content` but no `markdown`.

---

## 1. Bugs

### Data integrity — the markdown/block pipeline

The `markdown` column is canonical and the block document in `content` is a
derived cache. Feeding the 37 real notes through `markdown → blocks → markdown`
fails to return the input for **25** of them (a further 9 differ only by benign
normalisation: `*   ` → `- ` list markers and a blank line inserted after
headings).

| ID | Severity | Bug |
|----|----------|-----|
| D1 | **High** | Inline formatting is destroyed on any line that also contains math |
| D2 | **High** | Short lines containing an operator are converted into display-math blocks, destroying their text |
| D3 | Medium | Escaping is applied inconsistently and compounds across saves |
| D4 | **High** | 21 notes render *from* the corrupted cache, and editing one makes the corruption canonical |
| D5 | Low | Trailing whitespace is added or removed, changing hard-break semantics |
| D6 | Medium | Only one round-trip identity test exists, and it covers tables only |

**D1.** `parseMarkdownToNoteDocument` splits a paragraph at math boundaries and
emits the surrounding text as plain text, dropping the `<strong>`/`<em>` markup
the non-math path preserves.

```
"Some **bold text** plain."          → "Some <strong>bold text</strong> plain."   ✓
"Some **bold text** with $x^2$ math." → "Some bold text with" + math + "math."    ✗
```

Across the 37 notes, **166 bold markers are lost**. Many notes lose every one
they had: `differential_equations_thm - Partial derivatives` goes 8 → 0,
`vector_calculus_thm - Integration in R^n` 18 → 0.

**D2.** `isStandaloneLatexLine` (`lib/notes/math-regions.ts:53`) promotes a line
to a display-math block when it contains any of `= + - * / ^ _ < >` **and** has
three or fewer words of three-plus letters. Real casualties:

```
"\* \*\*Author:\*\* Robert W. Sebesta"  → "$$"        (author and ISBN destroyed)
"Highlight: ==key idea=="               → "$$\nHighlight: ==key idea==\n$$"
"**b^2:** squared."                     → "$$\nb^2: squared.\n$$"
"In C, a == b tests equality."          → "$$\nIn C, a == b tests equality.\n$$"
```

This is both a content-destruction bug and the reason the `==highlight==`
feature corrupts notes. Prose-word loss measured across the corpus: **21 words
in 4 notes**, all attributable to this rule.

*(An earlier count of "172 words lost" was a measurement artefact — it counted
letters inside LaTeX commands, which legitimately change under `normalizeLatex`.
The real figure is 21.)*

**D3.** 237 escape characters are added across the corpus and some notes *lose*
escapes: `\geq` → `\\geq`, `[2]` → `\[2\]`, while two CS notes go 54 → 38.

**D4** is the severity multiplier. `noteRecordToWorkspaceNote`
(`lib/notes/records.ts:217-221`) falls back to re-serialising the block cache
when `markdown` is empty. That is exactly the 21 legacy notes, so those users
see corrupted content **today**, and one keystroke promotes it to canonical.

**D6** explains why none of this was caught: `table-block.test.ts:30` is the
only assertion that `serialize(parse(x)) === x`, and it covers tables.

### Backend correctness

| ID | Severity | Bug | Location |
|----|----------|-----|----------|
| A1 | **High** | Upload returns raw `error.message`; zero `console.error` in the whole notes API | `app/api/notes/upload/route.ts:99-109` |
| A2 | **High** | Bulk delete ignores HTTP status; failed deletes vanish then reappear | `app/notes/notes-workspace.tsx:765-782` |
| A3 | Medium | Class moves never roll back; bulk move swallows errors to the console | `notes-workspace.tsx:716-729, 839-843` |
| A4 | Medium | Unguarded insert discards 30–90 s of paid AI work; no timeout budget; late size cap | `upload/route.ts:111-141` |
| A5 | Medium | PATCH overwrites `content` wholesale, destroying generation provenance | `app/api/notes/[id]/route.ts:69,77` |
| A6 | Medium | Deleting a note with a pending autosave poisons the queue for the session | `components/note-editor/use-autosave.ts:72-97` |
| A7 | Low | Duplicate copies stale markdown, losing the last ~200 ms of typing | `notes-workspace.tsx:559` |
| A8 | Low | 768-float embeddings shipped to the client unused; no markdown length cap | `app/(app)/notes/page.tsx:31` |

**A1** leaks Zod issue JSON (Zod 4 `ZodError.message` is a serialised issues
array), raw Azure response bodies, and environment-variable names, straight into
a toast. AGENTS.md §1, §5 and §11.1 all forbid this.

**A2** is the worst user-facing one. `fetch` resolves on 4xx/5xx, `response.ok`
is never checked, and the trailing comment says "for now just log" while nothing
logs. Five selected notes with three failing DELETEs all disappear silently and
are back on reload. The single-delete path at `:519-531` gets this right.

**Per-user scoping was audited exhaustively and is clean.** Every read and write
filters on `session.user.id`, and `classId` always goes through
`assertClassBelongsToUser`. Guessing another user's note id returns 404.

### Regressions from the editor rebuild

Reference point `42df3f0` (pre-rebuild tip, including the merged mermaid work).

| ID | Severity | Regression |
|----|----------|-----------|
| R1 | Medium | Code syntax highlighting does not work, and the requirements doc claims it does |
| R2 | Medium | Mermaid is a dead end: still generated, still parsed, never rendered |
| R3 | Medium | No inline-formatting affordance at all, and `Mod-i` is bound to something else |
| R4 | Low | Block drag-to-reorder was removed |
| R5 | Medium | No read-only note renderer; the editor is the only way to view a note |
| R6 | Low | `docs/note-editor-requirements.md` header contradicts itself |

**R1.** `extensions/theme.ts:54-79` defines only markdown tags. No
`keyword`/`string`/`comment`/`number`, `defaultHighlightStyle` is never
installed, and `app/globals.css` has no `.tok-*` rules. Code fences parse but
render in one flat colour. The doc asserts the opposite in two places.

**R2.** `lib/notes/generation.ts` still instructs the model to emit
```` ```mermaid ```` fences, the parser and serializer still round-trip a
`mermaid` block type, the `mermaid` dependency is gone and no renderer exists.
**0 notes are affected today**, so this is latent rather than live.

**R3.** No toolbar, no `Mod-b`, and `defaultKeymap` binds `Mod-i` to
`selectParentSyntax`, so the familiar shortcut actively does something else.
Formatting can only be applied by typing asterisks. Issue #6 is closed with this
acceptance criterion unmet.

### Embeddings

| ID | Severity | Bug |
|----|----------|-----|
| E1 | **High** for AI features | Notes are embedded only at upload; never on create or edit |

| source | total | embedded | stale after edit | text but no embedding |
|---|---|---|---|---|
| manual | 7 | **0** | 0 | 0 |
| upload | 51 | 47 | **5** | 2 |

No hand-written note has ever been embedded, so every note authored in the new
editor is invisible to flashcard and quiz generation. Five uploaded notes were
edited after upload and now carry a vector describing their *previous* text,
while `hasEmbedding` still reports "ready" — the UI gives no signal that the two
have diverged.

---

## 2. Missing features

| Issue | State | Note |
|---|---|---|
| #7 note analysis, auto-highlight key elements | not started | Blocks #89. Highest leverage of the set |
| #8 mind map from note content | in PR #61 | Open, mergeable, conflicts pending |
| #16 set up Pinecone | **moot** | No Pinecone anywhere; pgvector is already in use with a 768-dim column. Recommend closing as superseded |
| #57 chunked embeddings / topic retrieval | not started | |
| #86 images to blob storage | not started | `uploadImage` is never passed to `NoteEditor`, so every image is a base64 data URL capped at 2 MB |
| #88 class-page upload | not started | |
| #89 highlight-weighted generation | blocked on #7 | |
| *(unfiled)* embedding on save | — | E1 above |
| *(unfiled)* markdown backfill for 21 legacy notes | — | Must follow the D-series fixes |
| *(unfiled)* note-context contract, tests, dedupe | — | `lib/flashcards/context.ts` and `lib/quizzes/context.ts` are near-identical copies with no tests. Issue #9 closed with this AC unmet |

---

## 3. Fix plan

Ordered by dependency and blast radius. Each numbered step is one commit ending
green on `tsc --noEmit`, `eslint`, and `vitest run`.

### Phase 0 — stop the data bleeding

1. **Regression harness first.** Add `lib/notes/__tests__/round-trip.test.ts`
   with a checked-in fixture of anonymised real notes, asserting
   `serialize(parse(x)) === x` modulo the two agreed benign normalisations.
   It must fail on today's code; that is the point.
2. **Fix D2.** Require real evidence of maths before promoting a line: a LaTeX
   command, a math delimiter, or a symbol from the non-ASCII set. Bare
   `= + - * / ^ _ < >` in prose must never qualify. Add the four casualty lines
   above as explicit cases.
3. **Fix D1.** Carry inline markup through the math split so text segments keep
   their `<strong>`/`<em>` instead of being flattened.
4. **Fix D3 and D5.** Escape only what Markdown requires, and stop rewriting
   trailing whitespace.
5. **Backfill the 21 legacy notes** with `serializeNoteDocumentToMarkdown`, as a
   reviewed one-off script with a dry-run mode. **Only after 1–4**, because run
   today it would write every one of these bugs into the canonical column.

### Phase 1 — backend correctness

6. **A1.** `console.error("[POST /api/notes/upload]", error)` plus a short
   user-facing string, and the same sweep across the other notes routes. Also
   applies to `api/quizzes/generate` and `api/quizzes/evaluate`.
7. **A2, A3.** Check `response.ok` in every bulk path, roll back optimistic
   state on failure, and toast. Make bulk delete refuse temp ids the way single
   delete does.
8. **A4.** Wrap the insert, add `maxDuration`, add an `AbortSignal` to the Azure
   poll, and reject on `Content-Length` before buffering the body.
9. **A5.** Merge into `content` rather than replacing it, so `noteGeneration`
   provenance survives an edit.
10. **A6.** Have the workspace tell the autosave hook to drop a deleted note's
    queue entry.
11. **A7, A8.** Duplicate from the live editor text; stop shipping embeddings to
    the client; cap imported markdown length.

### Phase 2 — embeddings

12. **E1.** Compute the embedding on create and on update (debounced, and only
    when the text actually changed), backfill the notes that lack one, and
    surface staleness in the picker. This unblocks flashcards, quizzes, and the
    planned active-recall work in one change.

### Phase 3 — editor gaps

13. **R1.** Install `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`
    and correct the two false claims in the requirements doc. Fix R6 while there.
14. **R2.** Decide mermaid (see below) and make the code consistent either way.
15. **R3.** Add `Mod-b` / `Mod-i`, rebind `Mod-i` away from `selectParentSyntax`,
    and add a small selection toolbar.
16. **R5.** Add a read-only renderer, or record a decision that the editor is the
    only view.

### Phase 4 — features

17. **#7** auto-detection of definitions and formulas, which unblocks **#89** and
    would also let active recall rank extracted points by importance.
18. **#86** blob storage, and actually pass `uploadImage` to `NoteEditor`.
19. **#57**, **#88**, and the unfiled note-context contract work.

---

## 4. Decisions needed

These change the plan and are not mine to make.

1. **Mermaid: restore or remove?** The deleted renderer is ~34 lines and
   recoverable from `42df3f0`. Restoring costs a dependency; removing means
   deleting the generator instruction and the block type. No data is affected
   either way, so this is purely a product call.
2. **Close #16 as superseded?** pgvector is in use and Pinecone appears nowhere.
3. **Reopen #6 and #9, or file follow-ups?** Both are closed with acceptance
   criteria that are demonstrably unmet (inline formatting; highlighted sections
   in the context payload).
4. **Block drag-to-reorder (R4):** restore, or accept as an intentional
   simplification of a Markdown-native editor? Roughly 570 lines were removed.
5. **Scope of this branch.** Phases 0–2 are twelve commits of correctness work.
   If you want this to land quickly, Phase 0 alone is the defensible cut.
