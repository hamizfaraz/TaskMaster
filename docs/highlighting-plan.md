# Important-point highlighting — plan

> **Status: built, including suggestions.** Highlights can be applied, are
> read back out, render everywhere, and reach generation (§6). The note also
> suggests its own key points, and it does so **without a model** — see the
> correction to §3 below.
>
> #89's acceptance criterion — "a note with highlights produces a measurably
> different deck than the same note without them" — was verified against the
> live generator. Twelve facts, three cards, so the generator must choose:
>
> | | highlighted fact selected |
> |---|---|
> | without the highlight | 0 of 3 runs |
> | with the highlight | 3 of 3 runs, always as card #1 |

Covers [#7](https://github.com/hamizfaraz/TaskMaster/issues/7) (detect and
highlight key elements), [#89](https://github.com/hamizfaraz/TaskMaster/issues/89)
(weight highlights during generation), and the acceptance criterion of
[#9](https://github.com/hamizfaraz/TaskMaster/issues/9) that is closed but
unmet: "payload includes highlighted/important sections".

Measurements below come from running detection over the 52 real notes that have
markdown (747 blocks, 91k characters).

---

## 1. Where this actually stands

`==highlight==` is **editor-side styling and nothing else.**

| | state |
|---|---|
| Styled while editing | yes, `extensions/live-preview.ts:114` |
| A way to apply one | **none** — no shortcut, no button, no slash command |
| Survives a save | yes, it is plain markdown |
| Rendered anywhere else | **no** — `LatexMarkdown` loads only `remark-gfm` and `remark-math`, neither of which knows `==` |
| Read by anything downstream | **no** — the only consumer in the repo is the editor decoration |
| Automatic detection | **none** — #7 is not started |

**Real usage across all 58 notes: zero.** The single occurrence of `==` in the
corpus is `s[ root1 ] == s[ root2 ]`, C code inside a fence. That is not a
feature people are under-using; it is a feature with no entry point.

It is also worth recording that until this branch, typing a highlight actively
corrupted the note: `Highlight: ==key idea==` was promoted to a display-math
block and its text destroyed. That is fixed, so the syntax is now safe to build
on.

---

## 2. What the spec asks for

SDR 3.1.3 via #7:

- detect definitions, formulas, and important elements
- visually highlight them
- detect multi-topic notes and suggest splits

#89 adds: generation must cover highlighted definitions and formulas before
drawing on surrounding prose, and — the line that shapes this whole plan —
**"User highlights are weighted at least as strongly as auto-detected ones — an
explicit highlight is the strongest available signal of what the student thinks
matters."**

The multi-topic split half of #7 is a different feature that happens to share an
issue. It is out of scope here and should be split out.

---

## 3. Evidence: can detection be deterministic?

A rule-based detector was built and run over the corpus. It flags display math
as formulas, bold-led claims (`**Theorem.**`, `**Definition.**`, …), defining
prose ("is defined as", "is called", …), and list items that open with a bold
term.

```
747 blocks    221 flagged (30%)    44% of all note text
    104  formula-display     103  claim     10  keyed-term     4  definition-prose
```

It fails in both directions, and the two failures have different causes.

**It floods structured notes.** Theorem-dense notes are *made of* propositions
and display formulas, so almost everything qualifies:

| Note | flagged |
|---|---|
| Counting and Integers | 97% of text |
| Modular Arithmetic | 94% |
| Vector Operators | 93% |
| Real Numbers | 89% |

Highlighting 94% of a note carries exactly as much signal as highlighting none
of it.

**It misses prose notes.** 16 of 52 notes had nothing flagged. Some of those are
correct — a worked breadth-first-search trace of code and state tables has
nothing definitional in it. But others plainly do:

```
"...the specific Right-Hand Side, called the **handle**, ..."      missed
"Union by size guarantees that tree depth will never exceed log N"  missed
"...preserves the complete binary tree invariant."                  missed
```

Each near-miss is patchable with another rule, and each new rule pushes the
already-flooded maths notes further toward 100%. That is the usual rule-based
dead end: precision and recall move in opposite directions and neither reaches
useful.

**Conclusion — and a correction.** The conclusion first drawn here was that
automatic detection needs a model, because a deterministic detector cannot
separate "this proposition is the point of the note" from "this is the fourth
of nine propositions".

That was wrong, and wrong in an instructive way: the detector measured above
only *classified*. It never *ranked*. Every rule fired at a fixed weight, and
everything that fired was marked.

Importance is relative to the note. Weight a signal in inverse proportion to
how often it fires in the note it appears in — ordinary inverse-document-
frequency reasoning applied within one document — and "is a proposition"
collapses to near-zero weight in a page of forty propositions while staying
strong evidence in a page of prose. Add a per-note budget and the flooding
cannot happen by construction.

With ranking, over the same 52 notes:

| | classify only | classify and rank |
|---|---|---|
| share of note text marked | 44% | **10%** |
| worst single note | 97% | **32%** |
| finds "called the **handle**" | no | **yes** |
| finds "union by size guarantees…" | no | **yes** |

So the model is not needed for this. What remains true from the measurement is
narrower: *unranked* rules flood, and finding every formula is easy but
useless.

---

## 4. Decisions

### Q1 — Where do highlights live?

**User highlights stay as `==…==` inside the canonical markdown. Automatic
detections are never written into the user's text.**

Keeping user highlights in markdown needs no schema change, round-trips (now
that the promotion bug is fixed), and matches Obsidian. Auto-detections are
different in kind: writing them into someone's note would rewrite their words,
and #89 requires telling the two apart in order to weight them. So detections
are derived — computed on demand, or cached alongside the block document — and
carry a confidence, while a user highlight carries certainty.

### Q2 — Is detection automatic?

**Ship manual highlighting first. Treat auto-detection as a separate decision,
because the evidence says the cheap version does not work.**

This is not deferral for its own sake. #89 says an explicit highlight is the
strongest signal available, so manual highlighting is the part that carries the
most weight, and it costs nothing to run. It also makes #89 and #9's unmet
criterion deliverable end to end without settling the model question.

If auto-detection is wanted, §7 sets out what it would take.

### Q3 — How selective must highlighting be?

**Cap it. A highlight layer that marks more than roughly a fifth of a note is
not a feature.**

This applies to any detector, deterministic or not. Auto-detections get a budget
per note (start at 5, scaled by length) and are ranked, so a theorem-dense note
surfaces its five most important claims rather than all forty. User highlights
are never capped: those are the user's own judgement.

### Q4 — How does it render outside the editor?

**A small remark plugin turning `==x==` into `<mark>`.**

`remark-gfm` does not cover `==`. The plugin walks text nodes and splits them,
about thirty lines. `unist-util-visit` is not currently resolvable, so either
walk the tree manually or add that dependency (about 1 KB). Styling goes through
the existing semantic tokens so it follows dark mode without extra work.

This is what makes a highlight visible in flashcards, quizzes, and any future
read-only note view, rather than showing raw `==` to the reader.

### Q5 — How does generation consume highlights?

**Extract them into an explicit list and make coverage a prompt requirement.**

`lib/quizzes/context.ts` and `lib/flashcards/context.ts` currently return
`{id, title, markdown, embedding}` with no importance signal at all. They also
happen to be near-identical copies of each other with no tests, which is the
AGENTS.md §9 violation behind #9's third unmet criterion. Both get replaced by
one shared module that adds `highlights: string[]`, and the prompt is told to
cover them before drawing on surrounding prose.

Extraction must exclude code fences and math regions — the corpus proves why,
since its only `==` is C code. `findCodeRanges` and `findMathRanges` in
`lib/notes/math-ranges.ts` already provide exactly those exclusions, and the
editor decoration already uses them.

---

## 5. Data model

No migration for stage 1.

```ts
/** A span the user marked with ==…==. Certain by construction. */
type NoteHighlight = {
  text: string;      // the marked text, delimiters stripped
  from: number;      // offset into the canonical markdown
  to: number;
};

/** A span something guessed at. Never written into the user's markdown. */
type DetectedElement = NoteHighlight & {
  kind: "definition" | "formula" | "result" | "term";
  confidence: number;  // 0..1, used for ranking against the per-note budget
};
```

`extractHighlights(markdown): NoteHighlight[]` is pure and lives in
`lib/notes/highlights.ts`, beside the scanner whose exclusions it reuses.

---

## 6. Build order — manual highlighting

Each step is one commit ending green on `tsc --noEmit`, `eslint`, and
`vitest run`.

1. **Extraction.** `lib/notes/highlights.ts` with `extractHighlights`, excluding
   code and math. Tests: the C-code `==` in the corpus is not a highlight,
   `==` inside `$…$` is not a highlight, nested and unterminated markers, a
   highlight spanning inline math.
2. **A way to apply one.** `Mod-Shift-H` added to the inline-format keymap built
   on this branch, reusing `toggleInlineMarker("==")` which already exists and
   is tested. Plus an entry in the slash menu and the gutter block menu so it is
   discoverable without knowing the shortcut.
3. **Render it everywhere.** The remark plugin from Q4, wired into
   `LatexMarkdown`, styled with semantic tokens. Test that `==x==` produces a
   `<mark>` and that `==` inside a code span does not.
4. **Feed generation.** One shared note-context module replacing the two copies,
   returning `highlights`, with the tests #9 asked for and a documented
   contract. Quiz and flashcard prompts told to cover highlights first.
5. **Close the loop.** A generated deck from a note with highlights differs
   measurably from the same note without them — #89's acceptance criterion, and
   the only honest way to show the feature works.

At the end of step 5, #89 is met for user highlights and #9's payload criterion
is met. #7 remains open on auto-detection alone.

---

## 7. What was built for suggestions

`lib/notes/detect-highlights.ts`, pure and unit-tested.

**Candidates.** Blocks carrying at least one signal: a bold-led claim
(`**Theorem.**`, `**Definition.**`, …), a named claim (`**Theorem (Abel's
Theorem).**`), defining prose ("is called", "is defined as", "if and only if"),
a result or bound ("guarantees", "proves", "complexity is", "never exceeds"), a
short bold term, a term appearing for the first time, or opening a section.

**Scoring.** `base(signal) × log(1 + candidates / (1 + firings))`. The second
factor is the whole trick: a signal that fires in nearly every candidate is
worth nearly nothing. Long spans are discounted; ties break on document order so
the earliest statement of an idea wins and the output is stable.

**Budget.** At most a quarter of the blocks, capped at eight, and nothing at all
below four blocks — a note that short has nothing to rank against.

**Display math is never suggested.** `==…==` is inline syntax and cannot wrap a
multi-line `$$` block, so such a suggestion could never be accepted. This
surfaced only by testing the accept path: 24 of 115 suggestions failed it. All
103 now round-trip — the offsets slice exactly, and accepting produces a
highlight the extractor reads back.

**The feature.** A "Key points" toggle beside Source/Preview, off by default.
When on, suggestions appear as dotted underlines and a click accepts one,
wrapping it in `==…==` as a single undo step. Detection runs in the browser over
a document already in memory, so there is no request, no cost, and no delay, and
a point stops being suggested once it is highlighted. Nothing is written until
the user clicks: a suggestion is a dotted underline, a highlight is a decision.

---

## 8. Decisions needed

1. ~~Auto-detection: model or drop it?~~ **Resolved: neither.** Ranking made a
   deterministic detector good enough, so #7's highlighting half is met without
   a model. Whether a model would do *better* is now an optimisation, not a
   blocker.
2. ~~`unist-util-visit` as a dependency?~~ **Resolved:** the tree is walked by
   hand; no dependency added.
3. **Split #7.** Multi-topic detection and split suggestions are a separate
   feature sharing an issue with highlighting. They should be their own issue
   before either is planned properly. **Still open.**
4. **Tune the signal weights?** They are hand-set and measured only against one
   52-note corpus, which is one person's subjects. Worth revisiting once other
   people's notes exist.
