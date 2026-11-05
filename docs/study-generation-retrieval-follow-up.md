# Separate follow-up: retrieval for flashcards and quizzes

Status: preserved proposal, outside the note-generation branch's implementation scope.

Primary tracking: [#57 — Topic-Based Retrieval and Chunked Embeddings for Flashcard Generation](https://github.com/hamizfaraz/TaskMaster/issues/57).
Highlight prioritization: [#89](https://github.com/hamizfaraz/TaskMaster/issues/89).
Upstream producer: [#94 — Note generation and section indexing](https://github.com/hamizfaraz/TaskMaster/issues/94).

## Keep these ideas for a separate implementation

- Add an optional topic/concept focus to flashcard generation.
- Retrieve relevant note chunks using their embeddings instead of sending vector-number arrays to the model. Pass retrieved text and source IDs as evidence.
- Filter by authenticated owner and selected notes; expanding to other notes is an explicit product choice.
- Use heading paths, neighboring sections, formula labels, and conditions to contextualize highlights.
- Cluster or otherwise identify repeated concepts so multiple similar highlights do not crowd out broader coverage.
- Treat roughly 70% highlight-based output as an upper target, not a fixed allocation. When highlights are sparse, cover each distinct concept and fill remaining slots with other important material. A second item should test a meaningfully different aspect.
- Track generated items against source chunks/highlights; validate references and check omitted concepts and repetitive questions. References and vector similarity alone do not prove correctness or coverage.
- Compare generated questions/cards with previous items as a duplicate-screening signal, then inspect or regenerate likely repeats.
- Reuse the retrieval layer for quizzes in a separately scoped follow-up. Later work can retrieve explanations for missed concepts to support targeted practice.
- Use only current index revisions. Define a current-text fallback or visible indexing state for unavailable/stale indexes before enabling retrieval.
- Automatic and manually added highlights currently share the same Markdown syntax. Call them highlighted passages; differential weighting requires separately recorded provenance.

## Boundary with note generation

The note pipeline produces validated Markdown and revisioned section embeddings and can ship independently. This follow-up consumes those records and owns search, study controls, context allocation, and card/question generation. It must not rerun transcription or final-note generation to retrieve study context.

Implement on a separate branch against #57, after the chunk contract is available. Its tests and release gates concern retrieval relevance, ownership filtering, context size, highlight balance, duplicate handling, and generated study-material quality. Do not close #57/#89 when only the note pipeline ships.
