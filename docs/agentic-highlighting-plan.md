# Agentic key-point detection — plan

A follow-on to [highlighting-plan.md](./highlighting-plan.md). The deterministic
ranker built there is instant, free, offline, and good enough that it removed
the need for a model. This plans the layer *above* it, for the cases it
provably cannot reach.

Status: **planned, not built.** Nothing here is started.

---

## 1. What an agent buys that ranking does not

The ranker scores a note using only what is inside that note. Three limits
follow from that, and all three show up in real data.

### It is blind to the course

`parse_test_concepts` and `parse_test_grading_items` already hold, per course,
the syllabus's own list of concepts and the grading breakdown with weights. For
ACCT2301:

```
concepts: Financial Accounting | Business Language | Financial Statements |
          Balance Sheet | Income Statement | Statement of Cash Flows |
          Business Transactions | Accounts Receivable | Revenue Recognition | …
grading:  Exam I 33%   Exam II 33%   In-Class Quizzes 24%   Attendance 10%
```

The user has notes titled *Balance Sheet*, *Income Statement*, and *Statement
of Cash Flows*. The syllabus names each of those as a concept, and two thirds
of the grade is exams. That is a strong importance signal about a note's
content, and it lives entirely outside the note.

### It goes silent on flat content

Running the shipped ranker over those same notes:

| Note | Blocks | Suggested |
|---|---|---|
| Chapter 1: Financial Statements | 36 | 8 |
| Income Statement | 24 | 5 |
| Statement of Shareholders' Equity | 20 | **0** |
| Statement of Cash Flows | 9 | **0** |
| Notes to the Financial Statements | 9 | **0** |

The empty ones are flat lists — `- Cash Flows from Operating Activities` — with
no bold lead, no defining verb, no claim word. There is no lexical signal to
rank, so the ranker correctly declines. But a note whose *title is a syllabus
concept worth part of a 66% exam block* plainly contains something worth
marking. Only outside context can say so.

### It can rank a label above its own definition

In the Income Statement note the ranker returns:

```
3.51  term  **Revenues**
1.89  term  **Revenues**: Reported for goods or services that have been sold…
```

The bare list header outranks the sentence that actually defines the term,
because the header is shorter and carries the same signals. Choosing between
two near-duplicate spans is a judgement about meaning, which is exactly what
lexical scoring cannot do.

---

## 2. What already exists to build on

| Piece | State |
|---|---|
| `agent/base-agent.ts` | A `ToolLoopAgent` on `gemini-2.5-flash-lite`, `stopWhen: stepCountIs(6)`, **`tools: {}`** — the loop exists, it has no tools |
| `ai` package | 6.0.146, with `ToolLoopAgent` and typed `inputSchema` tools |
| Note context | `lib/notes/context.ts` — user-scoped, returns markdown plus highlights |
| Class context | `lib/classes/queries.ts` — `listUserClasses`, `assertClassBelongsToUser` |
| Candidate generation | `lib/notes/detect-highlights.ts` — blocks, signals, scores, budget |
| Span safety | `lib/notes/highlights.ts` — code/math exclusions, and the accept round-trip already unit-tested |
| Syllabus data | 148 concepts, 67 grading items across the user's courses |

The expensive parts are already built. What is missing is a tool surface and a
verification loop.

---

## 3. Decisions

### Q1 — Does the agent replace the ranker?

**No. The ranker is the first pass and the agent adjudicates.**

The ranker is free, instant, offline, and right most of the time. An agent that
re-derives its output would cost a model call per note to reproduce something
already correct. So the agent is invoked only where the ranker is weak, and it
receives the ranker's candidates and scores as a prior rather than starting
from the raw note.

Concretely, it earns its call when the note is linked to a course **and** one of:
the ranker returned nothing, the ranker's top scores are near-tied (no
discrimination), or the user explicitly asked for a second look.

### Q2 — What makes this an agent rather than one prompt?

Three things, each of which needs a loop:

1. **It gathers its own context.** Which syllabus concepts this note touches,
   what sibling notes in the same course already cover, and — once the data
   exists — which topics the user has got wrong. It decides what to fetch.
2. **It verifies its own output.** Every proposed span must exist verbatim in
   the note, sit on one line, fall outside code and math, and not already be
   highlighted. A span that fails is rejected and the agent tries again. This
   is not hypothetical: building the deterministic version, 24 of 115
   suggestions turned out to be unacceptable and only the round-trip test
   caught it.
3. **It stops.** On budget met, or evidence exhausted, via `stepCountIs`.

### Q3 — Read-only, or can it write?

**Read-only. It proposes; the user accepts.**

Same contract as the deterministic layer, for the same reason: a highlight is a
statement about what *the student* thinks matters, and #89 depends on telling
user intent from machine guess. An agent that writes `==…==` into a note
destroys that distinction permanently.

### Q4 — When does it run?

**On demand, behind a button. Never automatically on save.**

There is no job queue in this project. Running an agent loop on every autosave
would be several model calls per note per edit window. The deterministic layer
is already always-on and instant; the agent is a deliberate "look harder"
action with visible progress.

### Q5 — What does it return?

Spans, plus **a one-line reason**. The reason is most of the value: "the
syllabus lists this as a concept and exams are 66% of the grade" is something
the user can judge. A bare underline from an opaque model is worse than the
ranker's, because at least the ranker's is predictable.

---

## 4. The agent

### Tools, all read-only and user-scoped

| Tool | Returns |
|---|---|
| `getNoteCandidates(noteId)` | The ranker's blocks, signals and scores — the prior |
| `getSyllabusContext(noteId)` | Concepts and weighted grading items for that note's course |
| `getSiblingNoteTitles(noteId)` | Other note titles in the same course, to spot what is already covered |
| `getTopicPerformance(noteId)` | Weak topics from quiz attempts — **no data yet, see §6** |
| `verifySpans(noteId, spans[])` | For each span: exists verbatim, single line, outside code and math, not already highlighted |

**The acting user is resolved server-side from the session and is never a tool
parameter.** This is the single most important line in this document. A
model-supplied `userId` is a direct path to cross-account reads, and every tool
here touches per-user data.

### The loop

```
1. getNoteCandidates        → the ranker's view
2. getSyllabusContext       → what the course says matters
3. (optionally) getSiblingNoteTitles / getTopicPerformance
4. propose spans + kinds + reasons, within the ranker's budget
5. verifySpans              → reject anything unacceptable
6. if rejections remain and steps are left, revise and go to 5
7. return
```

`stopWhen: stepCountIs(8)`, which is the existing agent's pattern with room for
one verify-and-revise cycle.

### Output contract

```ts
type AgentSuggestion = HighlightSuggestion & {
  /** Why this span, in one line, shown to the user. */
  reason: string;
  /** "agent" so the UI and #89 can tell it from a ranked suggestion. */
  source: "agent";
};
```

Rendered as the existing dotted underline in a different accent, with the
reason as the tooltip. Accepting works exactly as it does today.

---

## 5. Safety

**Blocked on the auth guard.** `/api/chat` has no session check — `grep` for
`getSession` in that route returns nothing — and issue #80 is already blocked
on the same thing. A tool surface over per-user data must not be reachable from
an unauthenticated endpoint. This detection agent should get its own guarded
route rather than riding on the chat one.

Beyond that:

- **Note content is untrusted input.** A note can contain text that reads as an
  instruction. Tool results must be framed as data, the agent must never be
  able to act on instructions found inside a note, and the only thing it can
  emit is spans plus reasons — there is no tool that mutates anything.
- **Reasons are shown to the user**, so a nonsense justification is visible
  rather than hidden behind a confident underline.
- **Budget is enforced outside the model.** The per-note cap from the ranker is
  applied to the agent's output too; it cannot decide that forty spans matter.

---

## 6. What would make this not worth building

Recorded honestly, because two of these are true today.

- **Course linkage is thin.** Only **9 of 58 notes** have a `classId`, so the
  syllabus signal — the agent's main advantage — reaches about 16% of the
  library. Issue #88 (upload from the class page, with automatic association)
  would change that, and is arguably the higher-value work.
- **The performance signal has no data.** `quiz_attempts` is **empty**. Weighting
  by what the user got wrong is the most compelling agentic idea here and is
  currently unimplementable. It becomes real only once quizzes are used.
- **The ranker may already be enough.** It marks 10% of note text and the worst
  note is 32%, which is a usable feature. The agent's measurable job is the
  empty-note case and the near-tie case; if those turn out to be rare in
  practice, this is cost without benefit.

**Therefore: build the evaluation before the agent.** Take the notes where the
ranker returns nothing or near-ties, have a person mark what should have been
suggested, and measure. If the agent does not beat the ranker on that set, it
does not ship. That set does not exist yet and is step one.

---

## 7. Build order

1. **The evaluation set.** Twenty notes where the ranker is weak, with
   hand-marked expected points. Without this there is no way to tell whether
   any of the rest helped.
2. **The auth guard** on the agent route, and a session-resolved user for every
   tool. Nothing else starts until this is in.
3. **Read-only tools** over existing service functions — no reimplementation,
   each user-scoped, each unit-tested for scoping.
4. **`verifySpans`**, reusing the invariants already proven for the
   deterministic layer. This is the piece that makes the loop trustworthy, so
   it lands before the agent that depends on it.
5. **The agent** itself, with the loop in §4, measured against step 1.
6. **The UI**: a "Look harder" action beside the Key points toggle, streaming
   tool calls so the user sees what it is doing, with reasons in the tooltip.

Steps 2 and 3 are shared with issue #80, which needs the same tool surface for
the chatbot. Whichever lands first should build it for both.

---

## 8. Decisions needed

1. **Is the thin course linkage worth fixing first?** Issue #88 would take the
   syllabus signal from 16% of notes to most of them, and it benefits quizzes
   and flashcards too. It may simply be the better next feature.
2. **Own route, or wait for #80's tool surface?** Sharing avoids building the
   same tools twice; waiting couples this to a larger feature.
3. **Model.** The existing agent uses `gemini-2.5-flash-lite`. A judgement task
   over a whole note with syllabus context may want something stronger, which
   changes the cost argument in §3 Q4.
