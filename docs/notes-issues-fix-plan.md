# Notes — outstanding issues and the plan to fix them

> **Status: §1 and §2 are done.** Restore takes a class, a user with no classes
> gets a way forward instead of a failing button, `createTempNote` enforces the
> invariant in the type system, and `Alt+↑/↓` moves whole blocks. §3 is
> untouched. **#88 is no longer the next thing worth doing** — most of it landed
> with the class requirement; see the corrected §3.

Written after making notes class-mandatory, which fixed one thing and broke
another. Ordered by what is actually broken, then what was promised, then what
is merely absent.

---

## 1. Bugs introduced by the class requirement

### A1 — Restoring a note from the trash makes it invisible. **High.**

All **49** notes in the trash have `class_id IS NULL`; that is why they were
removed. Restore clears `deleted_at` and nothing else, so the note becomes live
with no class — and the sidebar no longer has an Unfiled group to show it in.
It exists, it is editable through search, and it appears in no list.

That is data becoming unreachable through a path I added.

**Fix.** Restore takes a class. `POST /api/notes/:id` accepts `{ classId }` and
requires one whenever the note has none; the trash row offers "Restore to…"
with the user's classes. A note can never re-enter the app without a home.

### A2 — A user with no classes hits a dead end. **Medium.**

Creation falls back to the first class and, with none, toasts "Create a class
first". True, but the notes page offers no way to make one and does not say
where to go. The old behaviour — an unfiled note — at least worked.

**Fix.** When the user has no classes, the notes page shows an empty state that
links to the classes page instead of a button that only ever fails.

### A3 — `createTempNote` still accepts `null`. **Low.**

The signature outlived the rule. Tightening it makes the invariant a type error
rather than a runtime toast.

---

## 2. A commitment I did not keep

### B1 — Block-aware line movement. **Medium.**

Declining to restore block drag-and-drop, I said the compensation would be
making `Alt+↑/↓` move whole blocks rather than single lines. It was never done,
so the decision took something away and gave nothing back.

**Fix.** `Alt+↑/↓` moves the construct the cursor is in — a list item with its
nested children, a fenced code block, a `$$…$$` block, a table — falling back
to CodeMirror's line move for ordinary prose.

---

## 3. Outstanding, in priority order

| Item | Why it sits here |
|---|---|
| **#88** class association on upload | **Mostly done.** The upload route requires a `classId` and verifies ownership, and `/notes` routes through a class picker, so nothing can be filed unfiled. What remains is an upload entry point on the class page — a button and a handler. |
| Read-only view and print | Small. The renderer exists and handles highlights; it needs a route and a print stylesheet. |
| Sorting and pinning | Small. Fixed newest-first is the only order today. |
| Tables as a grid | Medium, cosmetic. Tables round-trip correctly already. |
| #86 images to blob storage | Blocked on you choosing a provider. Latent: no note contains an inline image today. |
| #57 / #87 retrieval | Large, and now the keystone: #60 merged the chunker and nothing imports it, while six issues (#69, #72, #73, #74, #80, #87) wait on chunk-level retrieval. This is the next real build. |
| #7 multi-topic split | A separate feature sharing an issue with highlighting. |

**Not mine:** pull requests #62 and #63 now conflict with develop and have been
untouched since June. #61 and #60 are still mergeable and will not stay that
way. Rebasing them later costs more than rebasing them now.

---

## 4. Implementation order

1. **A1**, because live data is currently unreachable.
2. **A2** and **A3**, which are small and in the same files.
3. **B1**, the commitment.
4. Then **#57 Phase 2** — wire the chunker that #60 landed. #88's remainder is a
   small filler whenever one is wanted.

The original plan put everything behind #88 because #88 would populate class
links. It has, so that gate is gone and retrieval is what unblocks the most.
