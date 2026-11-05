# Reliable note generation with section embeddings

Status: implementation plan; application behavior has not changed.

Branch: `codex/57-note-generation-pipeline`, based on `develop`.

Primary issue: [#57 — Topic-Based Retrieval and Chunked Embeddings](https://github.com/hamizfaraz/TaskMaster/issues/57).
Related: [#7 — Note analysis and topic splitting](https://github.com/hamizfaraz/TaskMaster/issues/7) and [#89 — Highlight-aware flashcard generation](https://github.com/hamizfaraz/TaskMaster/issues/89).

This plan supplies the generation and indexing foundation for #57. It does not by itself complete that issue's topic-query UI and retrieval integration, or #7's user-approved splitting of existing notes. Refer to these issues without automatically closing them when the foundation ships.

## Outcome and constraints

Generate comprehensive, source-grounded Markdown notes with useful highlights, then index meaningful sections for study-material retrieval. Reduce repeated model output while preserving definitions, equations, conditions, examples, and uncertainty.

Keep Markdown canonical and the block document a derived cache. Reuse the shared math scanner, CodeMirror/MathLive editor, KaTeX renderer, existing authentication, and class ownership checks. Existing notes must remain readable throughout rollout.

Cost savings are a hypothesis to measure, not a consequence of fewer requests alone. Track actual input/output tokens, repairs, retries, embedding input, and latency.

## Current pipeline

`lib/notes/generation.ts` currently performs transcription, a full Markdown rewrite, topic splitting, then embedding. The normal path has three generation requests and one embedding request. Highlights are selected inside existing rewrite/split calls. Topic rebalancing favors a small number of substantial notes; each final note receives one 768-dimensional vector.

`app/api/notes/upload/route.ts` persists the resulting notes after generation. Provider retries are bounded per stage and share a deadline. Completed stages are not persistently checkpointed. Note edits can refresh the whole-note embedding, throttled by a 30-second freshness window. Study generators currently receive note bodies and numeric vectors rather than retrieved sections.

## Proposed pipeline

```text
Validate upload and ownership
  → identify or resume generation run
  → transcribe and checkpoint source
  → assign stable source-section IDs locally
  → generate final topic Markdown, highlights, and source references
  → validate locally; repair flagged topics within budget
  → save validated notes
  → split final Markdown into searchable sections locally
  → embed changed sections in bounded batches
  → atomically publish a complete index revision
```

For ordinary documents, combine rewriting and topic splitting into one final-generation request. Preserve transcription as a separate fidelity boundary. Local sectioning and validation do not need AI calls. Embedding requests may need several batches depending on provider limits.

### 1. Source preparation and final generation

- Preserve the full extracted source. Assign stable IDs to source paragraphs/sections using deterministic parsing; retain actual page references only when extraction supplies them.
- Provide the original text with IDs, not only a key-idea summary. The model identifies topics while writing final notes.
- Request structured output: `topics[{title, markdown, sourceSectionIds}]`, plus explicit dispositions for excluded non-content sections. Validate with Zod.
- Require comprehensive retention of definitions, formulas and assumptions, worked examples, caveats, and illegible/uncertain passages. Treat source content as data, not operational instructions.
- Select sparse highlights. Pair important formulas with a source-supported title or definition in the same single-line highlight. Keep math delimiters intact and preserve multiline derivations.
- Preserve the current preference for a few substantial notes. Apply local rebalancing only when it preserves source-reference unions and content.
- Estimate input and expected output size before requesting generation. Route oversized sources into bounded groups at natural section boundaries, preserving adjacent context and source IDs. Never silently truncate to fit a budget.
- A source block that alone exceeds the allowed budget requires a visible split/retry path; never cut a formula or code block arbitrarily.

### 2. Validation and bounded repair

Run inexpensive checks before accepting output:

- Provider completion status: reject token-limit truncation, empty responses, blocked output, and incomplete JSON.
- Schema: valid topic fields, allowed source IDs, bounded lengths, nonempty content, and no accidental empty topics.
- Coverage: every source section must be represented or explicitly accounted for. Flag suspicious content loss and duplicated topic bodies. References and length checks are signals, not proof of semantic coverage.
- Rendering: parse Markdown using existing conventions; inspect math regions with the shared scanner and validate supported LaTeX with KaTeX. Detect unmatched delimiters, broken fences, malformed highlight boundaries, and structural table errors without treating currency or code as math.
- Fidelity: compare obvious source anchors such as formulas and numbered examples where possible. Formula differences and unsupported commands require review/repair, not automatic mathematical rewriting. Rendering validity does not prove correctness.

Keep successful topics. Repair only flagged topics using their relevant source sections and concrete validation failures. Proposed initial limit: one content-repair request per failed topic and two across a normal run, additionally bounded by the existing deadline and a configured token budget. Provider transport retries remain distinct from content repair and count toward total usage.

If validation still fails, checkpoint the work and report a recoverable failure. Do not silently publish partial notes as a complete result or automatically replay the expensive legacy pipeline.

### 3. Persistent runs and safe recovery

Add a generation-run record with authenticated owner/class, file-content hash, pipeline/prompt/model versions, stage, validated artifacts, diagnostics, usage, and timestamps.

- Scope cache reuse to the same owner and class; never share private source content across users.
- Use stage-specific cache keys: transcription depends on file/extractor versions; final output depends on source/prompt/model versions; embeddings depend on exact embedding input/model/dimensions.
- Persist transcription and validated topics so embedding or database failures do not require another full generation.
- Use an idempotency key and a uniqueness constraint to prevent retries from creating duplicate notes. Concurrent attempts must claim or reuse a run rather than execute it twice.
- Save note rows and their run association transactionally. Preserve original source separately from later user edits; resuming an upload must not overwrite edited notes.
- Define retention, deletion, and class/note deletion handling for cached private source text before enabling persistent caching.
- Start with resumable bounded requests. Add a background worker only when the hosting/runtime requires it; resumability must not rely on an unawaited request callback.

### 4. Multiple embeddings per note

Create searchable chunks from canonical Markdown, not the potentially lossy derived block cache.

- Split by headings and paragraphs first. Start evaluation around 300–600 tokens per chunk; make the target configurable and bound each request by the embedding model's actual limits.
- Keep a definition, formula, and nearby conditions together. Keep worked steps together where size permits. Treat math, code, and tables as structural units.
- Use minimal overlap for context-dependent boundaries. Store canonical ranges separately from added embedding context to avoid duplicate retrieval text.
- Embed `note title + heading path + chunk text`. Extract highlights as metadata; do not create a separate AI call or embedding for every highlight initially.
- Retain the existing whole-note vector during migration for existing consumers. Count the additional whole-note embedding in cost measurements; reassess its value after retrieval adoption.

Proposed chunk fields: chunk ID, note ID, ordinal, heading path, canonical Markdown range, text, highlight ranges, embedding-input hash, embedding model/dimensions, note revision, index revision, and vector. Ownership and class filtering must be enforced through the parent note or consistently maintained metadata.

Store embedding inputs/version metadata explicitly. A matching vector dimension does not make different embedding models compatible. Validate returned vector count, dimensions, and finite values before publishing.

### 5. Edits and index freshness

- On content/title edits, debounce indexing and create a revisioned reindex request. Guarantee a trailing run after typing stops; a time gate alone can leave the last edit unindexed.
- Re-split deterministically. Reuse vectors only when the exact embedding-input hash and model version match. Heading/title changes affect embedding input even if body text stays the same.
- Reconcile deleted/reordered chunks. Publish the entire new index revision atomically once all required embeddings succeed.
- Discard stale job results if the note changed during embedding. Preserve the latest authored Markdown regardless of embedding failures.
- Retrieval uses only an index revision matching the note revision. While stale, fall back to current selected-note text or show indexing status rather than treating old chunks as current evidence.

### 6. Retrieval handoff and user feedback

Expose a shared retrieval contract returning source text, note/chunk IDs, heading path, highlights, and revision. Future flashcard/quiz work should search these vectors and pass retrieved text to Gemini instead of vector-number arrays.

Restrict retrieval to the authenticated user's selected notes by default. Rank highlighted concepts alongside broader topics, reduce repeated concepts, and retrieve neighbors when needed. Sparse highlights should receive coverage without being stretched into repetitive questions. Implement the topic-query controls and output-coverage checks in follow-up work for #57/#89.

Follow existing UI conventions: disabled controls with spinners, Sonner loading/success/error states, and short safe API errors with detailed server logs. Show meaningful stages such as “Reading document,” “Creating notes,” and “Preparing study material.” If indexing fails after notes save, explain that distinction and offer an indexing retry; prevent duplicate uploads as the default recovery. Update `hasEmbedding`-based study eligibility deliberately during migration.

## Implementation sequence

1. **Baseline and fixtures:** capture current behavior and usage on representative, permitted source documents. Define expected facts, formulas, examples, and highlights.
2. **Combined generation behind a flag:** add final-topic generation and local checks while preserving the legacy implementation for rollout control. Keep this slice independently measurable.
3. **Repair and checkpoints:** add migrations, run recovery, idempotency, and bounded targeted repair. Validate failure recovery before enabling by default.
4. **Chunk indexing:** add deterministic sectioning, chunk persistence, bounded embedding batches, revision publication, and compatibility with current note vectors.
5. **Incremental updates:** implement change hashing, trailing reindexing, stale-work rejection, deletion handling, and indexing feedback.
6. **Retrieval adoption:** switch shared study context to scoped chunk retrieval, then implement topic focus and coverage balancing under the linked issues.
7. **Rollout:** enable on a small set of new uploads, compare against the baseline, then expand. Reindex existing notes from saved Markdown without retranscribing uploads. Backfill incrementally with resumable progress and a usage ceiling.

Read the installed Next.js route/runtime guides before implementation. Coordinate Drizzle migrations with the auth-generated schema. Review `components/note-editor/README.md` and `docs/note-editor-requirements.md` before changing Markdown interpretation.

## Validation and release gates

Automated coverage should include mixed prose/math, highlighted labels with formulas, tables/code, long derivations, multi-topic documents, sparse highlights, duplicate concepts, illegible text, and oversized sources.

Exercise malformed/truncated provider output, missing/invalid source IDs, bounded repair, quota failures, partial embedding batches, duplicate submissions, interrupted saves, concurrent edits, stale index revisions, and cross-user access attempts.

Evaluate paired runs on identical sources. Record input/output tokens for every generation and repair call, embedding tokens where reported, retries, latency, rendering defects, missing facts, and unsupported claims. Record configured model versions; do not substitute historical price comments for measured usage.

Release only when:

- Combined generation preserves all fixture-designated critical facts/formulas and passes manual fidelity review on representative documents.
- Highlighted formulas render and remain editable in light/dark mode.
- Normal-size valid sources use one transcription and one final-generation request, without routine repair.
- Measured aggregate generation usage is lower than baseline at equivalent coverage; report embedding/storage overhead separately.
- Retry/recovery produces no duplicate notes and never overwrites user edits.
- Changed-section indexing reuses unchanged vectors, publishes consistent revisions, and prevents unauthorized or stale retrieval.
- Relevant tests, lint, type checking, and required repository CI pass.

Rollback through the generation feature flag and retrieval fallback. Keep saved Markdown and completed runs; disable the new path without deleting generated notes or forcing paid regeneration.
