# Active Recall — Requirements and Design

Status: **designed, not built.** Implements [#25](https://github.com/hamizfaraz/TaskMaster/issues/25)
(SRD 3.7.4). The route `/study/active-recall` is a 12-line scaffold today.

**No AI.** Active recall works on paper with a pen and a timer, and this feature
works the same way: no model call, no API key, no per-use cost, nothing to fail
offline. Notes become bullet points by reading the Markdown they already
contain, and the user grades their own recall with the help of a local text
matcher. Section 2 records the evidence behind that.

Section 1 is what was asked for. Section 2 is every decision that had to be made
before building. Sections 3–7 are the design. Section 8 is what this depends on
that does not exist yet.

---

## 1. Requirements

Each has an ID (`AR-1`, `AR-2`, …) so it can be referenced from issues, commits,
and tests. Priority is **Must** unless stated otherwise.

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| AR-1 | A user can create a recall set from **their own bullet points**. | Must | #25 acceptance |
| AR-2 | A user can create a recall set from **selected notes**, converted to bullet points. | Must | #25 acceptance |
| AR-3 | A **timed study phase** shows the points. | Must | #25 |
| AR-4 | A **timed recall phase** hides the points and takes free-text recall. | Must | #25 acceptance |
| AR-5 | The transition from study to recall is **unmissable**. | Must | #25 acceptance |
| AR-6 | Phase durations default to **~15 s study / ~30 s recall** and are **configurable**. | Must | #25 |
| AR-7 | After recall, a **review** shows each point as recalled or missed. | Must | Implied; without it the feature has no payoff |
| AR-8 | The **user decides** each verdict. Any automatic suggestion is a starting point, never the answer. | Must | It is their memory being judged |
| AR-9 | Sets **persist** and are re-runnable; each run is recorded as an **attempt**. | Should | Repetition is the technique |
| AR-10 | A set can be re-run with **only the missed points**. | Nice | Cheap, high value |
| AR-11 | **Progress across attempts** is visible on the set. | Nice | Motivates repetition |
| AR-12 | The whole feature runs **with no external service**. | Must | See the header |
| AR-13 | Curation shows the set's **reading load** against the chosen timing and can size one to the other. | Must | Measured: the default window cannot hold the points real notes produce |

### Detail

**AR-5** — the study→recall flip is where the technique lives or dies. It needs
more than a text swap: the points are **removed from the DOM**, not blurred or
hidden behind CSS that a screenshot or inspector defeats. An `aria-live` region
announces the phase, the progress bar changes colour, and the recall textarea
takes focus automatically so no time is lost hunting for it.

**AR-6** — 15 s is right for 3–5 points and absurd for 12. The UI offers presets
(Quick 15/30, Standard 30/60, Relaxed 60/120) plus custom numbers, and suggests
`max(15, 3 × pointCount)` seconds when a set is built. The value is stored per
set, so a set always replays under the timing it was designed for.

**AR-13** — the 15 s default only fits short points, and extracted points are
often not short. Time to read a five-point set *once*, before any memorising, at
230 wpm with a three-word pause per math span:

| Note | Median words/point | Read once |
|---|---|---|
| Real Numbers | 5 | 8 s |
| Applications of Integral Theorems | 13 | 24 s |
| Integral Theorems | 23 | 41 s |

Capacity per window:

| Words/point | 15 s | 30 s | 60 s |
|---|---|---|---|
| 6 | 9 | 19 | 38 |
| 15 | 3 | 7 | 15 |
| 30 | 1 | 3 | 7 |

A theorem-dense note on default timing gives the user 15 s to read 41 s of text.
They will fail and blame themselves rather than the set. So curation shows
"these 5 points take ~41 s to read; your study phase is 15 s", flags points over
~25 words, and offers one button that sizes the timer to the content
(`ceil(readSeconds x 1.4)`, rounded to 5 s). `readSeconds` is a pure function in
`lib/active-recall/scoring.ts`, unit-tested alongside the matcher.

**AR-8** — every point in the review is a toggle, pre-ticked from the matcher in
Q1 and freely changed. The saved attempt records which verdicts the user changed,
so self-assessment stays distinguishable from the suggestion.

---

## 2. Decisions

### Q1 — How is recall scored?

**Decided: the user grades, pre-ticked by a local token-overlap matcher tuned so
it never over-claims.**

The matcher normalises both sides (strips math delimiters, Markdown punctuation,
and stop words; light stemming), then for each original point finds the user's
best-matching line by what fraction of the point's content words it covers.
Above a threshold the point is pre-ticked. Each user line is consumed once, so
one line cannot satisfy three points.

Measured against five realistic recall responses over five computer-science
points, with the threshold swept:

| Threshold | Correctly pre-ticked (of 11) | Missed | **False positives** |
|---|---|---|---|
| 0.25 | 8 | 3 | **0** |
| **0.30** | **8** | **3** | **0** |
| 0.35 | 6 | 5 | 0 |
| 0.40 | 6 | 5 | 0 |
| 0.50 | 4 | 7 | 0 |

**0.30 is the operating point.** It catches verbatim and terse shorthand recall
in full, produces zero false positives on wrong or empty responses, and misses
only heavy paraphrase — "linearithmic" for `$O(n \log n)$` is a semantic
judgement token overlap cannot make.

That error profile is the right one for a suggestion. A false positive would
quietly tell someone they remembered something they did not, which corrupts the
feedback the whole technique depends on. A miss costs one click on a toggle
that AR-8 requires anyway. So the matcher is tuned to under-claim, the review
header frames it as "we pre-ticked what we could match — correct anything we got
wrong", and no score is shown until the user has confirmed.

A model-based grader was prototyped and did score paraphrase correctly. It is
not being used: it costs a call per attempt in a feature built around repeating
attempts, it cannot run offline, and it makes a study drill depend on an API key.
The prototype lives in the scratchpad, not the tree.

### Q2 — How do notes become bullet points?

**Decided: parse the Markdown the note already contains, then let the user
curate.**

Notes are Markdown. The parser walks blocks and keeps anything that states
something:

- list items become points, marker stripped
- bold-led statements (`**Theorem (Green's theorem).** For smooth functions…`)
  become points
- headings, code fences, tables, and horizontal rules are skipped — they label
  content rather than state it
- `$$…$$` display math stays attached to the sentence that introduces it, never
  orphaned into a point that is pure notation
- blocks with fewer than four non-math words are dropped
- long blocks split on sentence boundaries, with a guard so the split never
  happens inside math, because a point that takes 10 s to read cannot share a
  15 s window with four others (AR-13)

Run against three real notes from the database:

| Note | Source size | Candidate points |
|---|---|---|
| Integral Theorems | 1,477 chars | 8 |
| Real Numbers | 2,332 chars | 27 |
| Applications of Integral Theorems | 845 chars | 4 |

The output is usable — theorem statements, propositions, and definitions come
out whole with their math intact. Two weaknesses are structural and shape the
UI rather than being bugs. A dense note yields far more candidates than a 15 s
study phase can hold. And a note that opens with a syllabus list yields
list-shaped fragments ("Least upper bounds; simple examples.") that are topics,
not facts.

So extraction produces **candidates, not a set.** The preview step presents them
as a checklist with the first few pre-checked and every one editable. The user
picks. That is not a workaround: choosing what is worth recalling is part of the
technique, and a model choosing for you removes the thinking the method exists
to force.

### Q3 — Which notes can be used as a source?

**Decided: any note with non-empty `markdown`.**

Quizzes and flashcards gate note selection on `hasEmbedding`. That would be wrong
here even setting AI aside, because the database says the gate does not track
usable content:

| source | total | has embedding | has markdown |
|---|---|---|---|
| manual | 7 | **0** | 0 |
| upload | 51 | 47 | 37 |

No hand-written note has ever been embedded — nothing computes an embedding on
note create or update, only on upload. Separately, 21 of 58 notes have no
`markdown` at all but do carry block `content`; they predate Markdown becoming
canonical. Twelve of those pass the embedding gate today and then contribute the
string "(No readable note body was stored for this note.)" to quiz and flashcard
prompts, so a third of the library silently degrades those features right now.

Active recall gates on the thing it actually reads. The picker keeps the
existing markup and disabled-row treatment, with the subtitle changed from
"Embedding ready" / "Embedding required" to "Ready" / "No text yet". Backfilling
`markdown` from `content` via `serializeNoteDocumentToMarkdown` is separate work
that would make 21 more notes usable here and fix the two AI features properly.

### Q4 — What is the persisted unit?

**Decided: `recall_sets` + `recall_attempts`, mirroring `quizzes` + `quiz_attempts`.**

Repetition *is* the technique. A set is the reusable artefact (points, timing,
provenance); an attempt is one run. The split gives AR-9/AR-10/AR-11 directly
and leaves a clean join for spaced repetition
([#76](https://github.com/hamizfaraz/TaskMaster/issues/76)) later.

### Q5 — What does the user type during recall?

**Decided: one textarea, split on newlines at submit.**

Separate inputs per point would leak how many points there were, which is part
of what is being recalled. One textarea matches how this is done on paper.

### Q6 — How is the timer implemented?

**Decided: a wall-clock deadline, not an interval that decrements state.**

Both existing timers decrement a counter on a 1 s interval, and the quiz timer
lists `remainingSeconds` in its effect dependencies, so it tears down and
recreates the interval every tick. That drifts, and browsers throttle background
intervals. Over a 25-minute Pomodoro a few seconds is invisible; over a 15-second
phase it is 10% of the phase.

Instead: store `deadline = Date.now() + seconds * 1000`, tick every 100 ms for a
smooth bar, derive remaining time from the clock each tick. Accurate,
throttle-proof, and the same shape as `finishAttempt`'s elapsed-time maths.

### Q7 — Do phases auto-advance?

**Decided: yes, both, with manual early advance.**

Quizzes deliberately do *not* auto-submit on expiry. Right for an exam, wrong
here: clock pressure is the mechanism. Study auto-flips to recall at zero;
recall auto-submits at zero. "Start recall now" and "Done" move early. Escape
abandons with a confirm.

Because grading is local, review renders **instantly** when recall ends. There
is no spinner and no intermediate phase.

### Q8 — Where does the code live?

**Decided: `app/active-recall/active-recall-client.tsx` for the workspace, with
the session runner extracted to `components/study/recall-session.tsx`.**

The observed convention is one monolithic client per feature (`quizzes-client.tsx`
is 1,838 lines) and the in-progress study PRs follow it. The workspace does too.
The session runner is extracted anyway: AGENTS.md §9 requires extraction, and the
timer and phase machine are the part most needing isolated fake-timer tests.

`StatPill` and `readJsonResponse` are currently copy-pasted into both existing
clients. They move to `components/ui/stat-pill.tsx` and `lib/api-client.ts`
rather than being pasted a third time.

### Q9 — How are errors surfaced?

**Decided: Sonner toasts.**

The two existing workspaces disagree — flashcards uses toasts, quizzes uses a
persistent banner and imports no toast library. AGENTS.md §1 mandates toasts for
async API feedback, so quizzes is the outlier. With no model calls the only async
work is save and delete, both fast, so plain `toast.success` / `toast.error`
suffice; no `toast.loading` is needed anywhere in this feature.

### Q10 — Class scoping

**Decided: a nullable `class_id` on the set**, matching `note.class_id`, so a
later "drill this class" needs no migration.

---

## 3. Data model

Two tables in `lib/db/schema.ts`, migrated with `pnpm db:generate` then
`pnpm db:migrate`.

```
recall_sets
  id              text pk, crypto.randomUUID()
  user_id         text → user(id) on delete cascade, not null
  title           text not null
  source_note_ids    text[] not null default '{}'
  source_note_titles text[] not null default '{}'
  points          jsonb not null            -- RecallPoint[]
  point_count     integer not null
  study_seconds   integer not null default 15
  recall_seconds  integer not null default 30
  class_id        text → parse_test_course(id) on delete set null
  created_at, updated_at  timestamp
  index: user_id, created_at

recall_attempts
  id              text pk
  set_id          text → recall_sets(id) on delete cascade, not null
  user_id         text → user(id) on delete cascade, not null
  response        text not null             -- verbatim recall text
  results         jsonb not null            -- RecallResult[]
  recalled_count  integer not null
  point_count     integer not null
  score           double precision not null -- recalled / point_count
  mode            text not null             -- "full" | "missed-only"
  time_spent_seconds integer
  completed_at, created_at  timestamp
  index: set_id, user_id, created_at
```

```ts
type RecallPoint = {
  id: string;
  text: string;                 // markdown, may contain $math$
  sourceNoteTitles: string[];
};

type RecallResult = {
  pointId: string;
  recalled: boolean;            // as the user finally left it
  suggested: boolean;           // what the matcher proposed
  matchedText: string;          // the user's own words that matched, or ""
};
```

`suggested` and `recalled` are stored separately so a later analysis can tell
how often the matcher agreed with the person.

`lib/active-recall/storage.ts` exposes `hasActiveRecallStorage()` probing both
tables with `to_regclass`, plus `activeRecallStorageUnavailableMessage`, exactly
as `lib/quizzes/storage.ts` does — AGENTS.md gotcha #9.

---

## 4. API surface

All routes: `runtime = "nodejs"`, session guard first, `safeParse` on the body,
`{ error: string }` responses, never the Zod issue array.

| Route | Method | Purpose |
|---|---|---|
| `/api/active-recall` | GET | List the user's sets |
| `/api/active-recall` | POST | Create a set |
| `/api/active-recall/[id]` | GET / PATCH / DELETE | Read, edit, remove a set |
| `/api/active-recall/extract` | POST | Note ids → candidate points (no persistence) |
| `/api/active-recall/[id]/attempts` | GET / POST | Attempt history, record an attempt |

There is no grading route. Matching runs in the browser, because it is pure text
work over data the client already holds, and doing it locally is what makes the
review instant.

`/extract` exists only because note `markdown` is not shipped to the client with
the note list (it would be megabytes). It fetches the selected notes scoped to
the user, runs the pure extractor, and returns candidates. Nothing persists until
the user saves, so a poor extraction costs nothing.

Library modules, all pure and unit-tested, none touching the network:

- `lib/active-recall/extract.ts` — `extractRecallPoints(markdown)`, Q2
- `lib/active-recall/scoring.ts` — `matchRecall(points, response)`,
  `summarizeAttempt(points, results)`, Q1
- `lib/active-recall/records.ts` — Zod schemas and row↔domain mappers
- `lib/active-recall/types.ts`, `storage.ts`

---

## 5. UI and state

### Views

```ts
type View = "library" | "create" | "session";
```

The session owns its own phase machine so the top level stays small:

```ts
type Phase = "ready" | "study" | "recall" | "review";
```

### Library

The established shape verbatim: a `StatPill` row (`N sets`, `N points`,
`N attempts`) and a primary `Create recall set` button, then a card grid or the
centred empty state. Each card shows title, point count, last-score badge,
`Updated …` with `suppressHydrationWarning`, and the hand-rolled `⋯` menu
(Edit / Duplicate / Delete) with the inline delete-confirm strip. Clicking a card
starts a run, matching how a quiz card behaves.

### Create

Two steps as `Context` / `Preview` pills.

**Context** has two tabs. *Write my own* is a textarea, one point per line, with
a live count. *From notes* is the existing note-picker markup — the same
`<label>`-wraps-`<input>` structure the tests rely on — with eligibility per Q3.
Below either tab sit the timing presets.

**Preview** is the curation step Q2 requires: every candidate is a checkbox row
with an inline `Textarea`, the first few pre-checked, plus `Add point`, per-row
remove, and source-note badges. `onChange` keeps raw text and `onBlur` runs
`normalizeTextMathToLatex`, matching the deck and question editors. Save is gated
on a non-empty title and at least one checked, non-empty point.

### Session

| Phase | Shows |
|---|---|
| `ready` | Title, point count, both durations, a large **Start**. None of the content. |
| `study` | Points via `LatexMarkdown`, countdown bar, `Start recall now`. |
| `recall` | Points **removed from the DOM**, autofocused textarea, countdown bar in a different colour, `Done`. |
| `review` | Each point with a pre-ticked toggle, the matched fragment beneath it, then the score once confirmed. Actions: `Run again`, `Drill missed only`, `Save attempt`, `Back`. |

The countdown reuses the established vocabulary — the Pomodoro
`h-3 rounded-full bg-surface-muted` track with a `bg-accent` fill and the
`text-5xl font-semibold tracking-tight` readout — driven by the Q6 clock.

Accessibility: an `aria-live="polite"` region announces each phase change; the
timer is `role="timer" aria-live="off"` so it is not read every tick; the recall
textarea takes focus on phase entry; the bar transition drops under
`prefers-reduced-motion`. Keyboard: Enter advances, Ctrl+Enter finishes recall,
Escape abandons with a confirm.

---

## 6. Test plan

Pure logic in `lib/active-recall/` — the bulk of the feature, and all of it
testable without a network or a browser:

- `extract.test.ts` — list items, bold-led statements, headings and fences
  skipped, `$$…$$` kept with its sentence, sentence splitting never breaking
  inside math, the four-word floor, the length cap.
- `scoring.test.ts` — normalisation and stemming, one user line consumed by at
  most one point, the 0.30 threshold's behaviour on the five recorded response
  styles, `summarizeAttempt` counts, empty response and empty set edges, user
  overrides taking precedence over suggestions, and `readSeconds` counting math
  spans while ignoring markup (AR-13).
- `records.test.ts` — Zod schemas, row↔domain mappers, malformed `points` jsonb
  degrading to `[]` the way `normalizeQuestions` does.

Components:

- `recall-session.test.tsx` with `vi.useFakeTimers()` — study auto-advances at
  zero, recall auto-submits at zero, early advance works, abandoning clears the
  timer, and the points are **absent from the DOM** during recall (assert with
  `queryByText`, never on a class name).
- `active-recall-client.test.tsx` — the picker disables text-less notes, the
  extract → curate → save round-trip, missed-only re-run carrying the right
  subset. `react-markdown` and the rehype/remark plugins mocked as in
  `flashcards-client.test.tsx`.

---

## 7. Build order

Each step ends green (`tsc --noEmit`, `eslint`, `vitest run`) and is its own
commit.

1. **Schema + migration + storage probe.** No UI.
2. **Pure domain layer** — `types`, `records`, `extract`, `scoring`, with their
   tests. This is most of the feature's logic and none of its plumbing.
3. **API routes** — CRUD, `/extract`, attempts, all storage-guarded.
4. **Session runner** — `recall-session.tsx`: clock, phases, fake-timer tests.
   Driven by hardcoded points at first.
5. **Workspace** — library, create, picker, curation, wiring. `StatPill` and
   `readJsonResponse` extracted here.
6. **Polish** — `/study` overview card flips to `live`, `StudyMethodPage` gains
   optional detail props so a live page shows no scaffold notice, a11y pass,
   dark-mode check.

---

## 8. Dependencies and risks

**Extraction quality tracks note shape.** Structured notes (theorems,
definitions, lists) extract well; flowing prose yields sentence-sized points that
are longer than ideal, and a syllabus list yields topics rather than facts. The
curation step in Q2 is the mitigation, and it is why preview is mandatory rather
than skippable.

**21 of 58 notes have no `markdown`** and cannot be a source until a backfill
runs (Q3). Separate work; it also repairs quiz and flashcard generation.

**`StudyMethodPage` always renders a "Scaffolded" `EmptyState`.** Its
`detailTitle`/`detailDescription` props must become optional before any study
page can go live. One-line change; the other four scaffold pages are unaffected.

**Overlap with open PRs.** [#62](https://github.com/hamizfaraz/TaskMaster/pull/62)
(cheat sheet) and [#63](https://github.com/hamizfaraz/TaskMaster/pull/63)
(spaced repetition) both conflict with `develop` and both touch
`app/notes/notes-workspace.tsx`, which the editor rebuild rewrote. Active recall
touches none of their files and can land independently — but #63 brings its own
review-scheduling model, and if it lands first, AR-9's attempts should feed it
rather than duplicate it.

**No external dependencies.** No model calls, no API key, no per-use cost, and
nothing in this feature breaks when the network does. Offline is a supported
state, not a degraded one.
