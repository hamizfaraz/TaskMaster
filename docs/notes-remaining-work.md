# Notes — everything still undone

Scope: the notes feature set. The wider backlog (calendar, auto-schedule,
quizzes, flashcards, resources, AskHamiz, the other study techniques) is
roughly twenty more open issues and is deliberately out of scope here; §6 says
where it sits relative to this.

Ordering principle: **what stops the app being usable day to day, then what
unblocks the most other work, then what was lost, then the filed backlog.**
Issue numbers are current as of writing.

---

## 1. The app cannot find anything

Unfiled, and the largest gap. There are 58 notes and no way to search them.

| Gap | Shape |
|---|---|
| No note search, by title or content | **Small** |
| No find-within-a-note | **Small** |
| Sort is hardcoded to last-updated; no pinning or favourites | Small |

**Search is far cheaper than it looks.** The notes page already sends every
note's markdown to the client — 89 KB for all 58 — so search needs no endpoint,
no index, and no round-trip. Filter the list the client already holds, match on
title and body, show the matching line. Postgres full-text is available and
works if the library ever outgrows that, but it is not needed now.

Find-within-a-note is `@codemirror/search`, which is not currently installed,
plus its keymap. That is close to a one-line change.

Sorting and pinning are a preference and a nullable column respectively.

**Do this first.** It is the smallest work with the largest daily effect, and
every note added makes its absence worse.

## 2. Nothing comes out, and nothing comes back

| Gap | Shape |
|---|---|
| No export, download, or print | **Trivial** |
| Delete is permanent — no trash, no undo | Medium |

Export is near-free because Markdown is already the canonical format: serve
`note.markdown` as a file download. A print stylesheet on a read-only view
(§4) covers printing.

Trash needs a `deleted_at` column, a filter on every note query, a restore
action, and a decision about whether anything purges. Worth it: deletion is
currently irreversible and the bulk path deletes several at once.

## 3. One quick win while in there

The notes page ships the derived block cache to the client — **1.1 MB across 58
notes, twelve times the size of the markdown** — and nothing client-side reads
it. The editor takes `content.markdown`; `content.document` has no reader
outside the server.

Stop selecting it for the list payload. This is the same class of fix as the
embedding vectors already trimmed, and larger.

## 4. What the editor rebuild dropped and never got back

| Gap | Shape | Note |
|---|---|---|
| No read-only note view | Small | `LatexMarkdown` already renders notes correctly, including highlights. Needs a route and a print stylesheet. |
| Mermaid is a dead end | Small either way | The generator is still told to emit diagram fences and nothing renders them. **Needs a decision**: restore the ~34-line renderer plus the dependency, or delete the instruction and the block type. No note is affected yet. |
| Tables render as monospace pipes, not a grid | Medium | A CodeMirror widget, in the same shape as the math widgets. |
| Block drag-to-reorder | **Large** | About 570 lines were deleted. **Needs a decision**: is this wanted in a Markdown-native editor, where `Alt+↑/↓` already moves lines? |

## 5. Filed and genuinely outstanding

| Issue | What | Shape |
|---|---|---|
| **#88** | Class-page upload with automatic association | Medium |
| #86 | Images to blob storage, instead of base64 at a 2 MB cap | Medium |
| #7 | Multi-topic detection and split suggestions | Medium |
| #57 | Chunked embeddings and topic retrieval | Large |
| #87 | Index syllabus and class data for cross-feature retrieval | Large |
| #8 | Mind map from note content | In PR #61, needs a rebase |

**#88 is the one to pull forward.** Only **9 of 58 notes** carry a `classId`.
That single number starves the key-point agent's syllabus signal, weakens quiz
and flashcard context, and blocks anything that wants to reason across a class.
Fixing the association at upload time is worth more than any single feature
downstream of it.

#86 is load-bearing for the editor too: `uploadImage` is never passed to
`NoteEditor`, so every pasted image becomes a base64 data URL inside the
markdown column.

## 6. Housekeeping — three issues describe work that is done

Not closed here, because re-scoping them is the owner's call.

- **#85** — session guard on `/api/chat` and a per-user scoping audit. The
  guard is in; the audit came back clean across every notes route.
- **#89** — highlight-weighted generation. Verified against the live generator:
  the highlighted fact was selected 0 of 3 runs without the highlight and 3 of 3
  with it.
- **#7, the highlighting half** — detection, ranking, suggestion, and acceptance
  all ship. Only the multi-topic split remains, which is really a separate
  feature sharing an issue.
- **#16** — asks for Pinecone. pgvector is already in use with a 768-dimension
  column. Close as superseded.

## 7. Suggested order

1. **Search, find-in-note, export, payload trim.** A day's work between them,
   and it changes how the app feels to use every day.
2. **#88 class association.** Unblocks the most downstream value per unit of
   effort.
3. **Trash and restore.** Removes the only irreversible action in the feature.
4. **Read-only view**, which also gives print, and settles the mermaid question.
5. **#86 images**, then the larger retrieval work in #57 and #87.
6. Tables as a grid, and the drag-reorder decision, last: both are polish
   against a Markdown editor that already works.

## 8. Decisions needed

1. **Mermaid**: restore the renderer, or remove the generator instruction and
   the block type?
2. **Drag-to-reorder**: restore roughly 570 lines, or accept its loss as an
   intentional simplification?
3. **Trash**: does anything eventually purge, or is it kept forever?
4. **Scope**: this covers notes only. The other twenty-odd open issues span six
   features and want their own pass.
