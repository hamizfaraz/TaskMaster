import { findCodeRanges, findMathRanges, type ExcludedRange } from "@/lib/notes/math-ranges";
import { findHighlightRanges } from "@/lib/notes/highlights";

/**
 * Suggest the points in a note that are worth marking.
 *
 * The naive version of this — flag anything matching a "looks like a
 * definition" rule — was measured over 52 real notes and failed in both
 * directions at once. It flagged 89-97% of theorem-dense notes, because those
 * notes are *made of* propositions, and nothing at all in a third of the
 * corpus. Marking 94% of a note carries exactly as much information as marking
 * none of it.
 *
 * The fix is that importance is **relative to the note**, not absolute. A
 * signal earns weight in inverse proportion to how often it fires in the note
 * it appears in: being a proposition is meaningless in a page of forty
 * propositions and highly distinguishing in a page of prose. That is ordinary
 * inverse-document-frequency reasoning applied *within* one document, and it
 * is what stops dense notes flooding.
 *
 * Everything here is pure text work. It runs in the browser on a document the
 * editor already holds, so suggestions are instant, free, and available
 * offline.
 */

export type SuggestionKind = "definition" | "result" | "term";

export type HighlightSuggestion = {
  /** Offsets of the span to mark, in the markdown passed in. */
  from: number;
  to: number;
  /** The text at that span. */
  text: string;
  kind: SuggestionKind;
  /** Rank score. Only meaningful relative to other suggestions in the note. */
  score: number;
};

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/** Words that open a formal claim in academic notes. */
const CLAIM_WORDS =
  "Definition|Theorem|Proposition|Lemma|Corollary|Axiom|Claim|Property|Rule|Law|Principle|Invariant";
const CLAIM_RE = new RegExp(`\\*\\*\\s*(${CLAIM_WORDS})\\b`, "i");
/** `**Theorem (Abel's Theorem).**` — a claim someone bothered to name. */
const NAMED_CLAIM_RE = new RegExp(`\\*\\*\\s*(${CLAIM_WORDS})\\s*\\([^)]+\\)`, "i");

/** Prose that defines a thing. */
const DEFINING_RE =
  /\b(is|are) (defined as|called|known as|denoted)\b|\bwe (define|call|denote)\b|\brefers to\b|\bmeans that\b|\bif and only if\b|\bis the\b.{0,40}\bof\b/i;

/** Prose that states a consequence or bound. */
const RESULT_RE =
  /\b(guarantees?|proves?|implies|ensures?|therefore|hence|it follows|never exceeds?|at most|at least|complexity is|runs in|bounded by)\b/i;

/** A short bold run reads as a keyed term rather than emphasis. */
const BOLD_TERM_RE = /\*\*([^*\n]{2,40})\*\*/g;

type Signal =
  | "claim"
  | "namedClaim"
  | "defining"
  | "result"
  | "boldTerm"
  | "opensSection"
  | "newTerm";

const BASE_WEIGHT: Record<Signal, number> = {
  claim: 3,
  namedClaim: 2,
  defining: 3,
  result: 2,
  boldTerm: 1.5,
  opensSection: 1,
  newTerm: 2,
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

type Block = { text: string; from: number; to: number; opensSection: boolean };

function insideAny(ranges: readonly ExcludedRange[], from: number, to: number) {
  return ranges.some((range) => from >= range.from && to <= range.to);
}

/** Split markdown into blocks, keeping fences and display math intact. */
export function splitIntoBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let buffer: string[] = [];
  let start = 0;
  let cursor = 0;
  let inFence = false;
  let inMath = false;
  let afterHeading = false;

  const flush = (end: number) => {
    const text = buffer.join("\n");
    if (text.trim()) {
      blocks.push({ text, from: start, to: end, opensSection: afterHeading });
      afterHeading = false;
    }
    buffer = [];
  };

  for (const line of lines) {
    const lineStart = cursor;
    cursor += line.length + 1;

    if (/^\s*```/.test(line)) {
      if (buffer.length === 0) start = lineStart;
      inFence = !inFence;
      buffer.push(line);
      if (!inFence) flush(cursor - 1);
      continue;
    }
    if (inFence) {
      buffer.push(line);
      continue;
    }
    if (line.trim() === "$$") {
      if (buffer.length === 0) start = lineStart;
      buffer.push(line);
      inMath = !inMath;
      if (!inMath) flush(cursor - 1);
      continue;
    }
    if (inMath) {
      buffer.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush(lineStart);
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      flush(lineStart);
      afterHeading = true;
      continue;
    }
    // A new list item starts a new block so suggestions can land on one item.
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(line) && buffer.length > 0 && /^\s*(?:[-*+]|\d+\.)\s/.test(buffer[0] ?? "")) {
      flush(lineStart);
      start = lineStart;
    }
    if (buffer.length === 0) start = lineStart;
    buffer.push(line);
  }

  flush(cursor);
  return blocks;
}

/** Text with math, code, and markdown punctuation removed. */
function prose(text: string) {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[*_#>|~=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string) {
  return prose(text).split(" ").filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

type Candidate = {
  block: Block;
  signals: Set<Signal>;
  kind: SuggestionKind;
  /** The narrower span to mark, when the block names a term. */
  span: { from: number; to: number; text: string };
};

function pickSpan(block: Block): { from: number; to: number; text: string } {
  const trimmed = block.text.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "");
  const offset = block.text.length - trimmed.length;
  // One sentence is a better highlight than a six-sentence paragraph.
  const sentence = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? trimmed;
  const text = sentence.trim();
  const from = block.from + offset + sentence.indexOf(text.charAt(0) === "" ? sentence : text);
  return { from, to: from + text.length, text };
}

function classify(block: Block, seenTerms: Set<string>): Candidate | null {
  const text = block.text;
  const trimmed = text.trim();

  if (/^\s*```/.test(trimmed) || /^\s*\|/.test(trimmed) || /^\s*(-{3,}|={3,})\s*$/.test(trimmed)) {
    return null;
  }

  // Display math is deliberately *not* suggested. `==…==` is inline syntax and
  // cannot wrap a multi-line `$$` block, so such a suggestion could never be
  // accepted — and a formula needs no highlight to be found, since the shared
  // scanner already locates every one of them for free.
  if (/^\$\$/.test(trimmed)) {
    return null;
  }

  const signals = new Set<Signal>();
  if (CLAIM_RE.test(trimmed)) signals.add("claim");
  if (NAMED_CLAIM_RE.test(trimmed)) signals.add("namedClaim");
  if (DEFINING_RE.test(prose(trimmed))) signals.add("defining");
  if (RESULT_RE.test(prose(trimmed))) signals.add("result");
  if (block.opensSection) signals.add("opensSection");

  BOLD_TERM_RE.lastIndex = 0;
  const boldTerms = [...trimmed.matchAll(BOLD_TERM_RE)].map((match) => (match[1] ?? "").trim());
  const termish = boldTerms.filter((term) => term.split(/\s+/).length <= 5 && !CLAIM_RE.test(`**${term}`));
  if (termish.length > 0) {
    signals.add("boldTerm");
    if (termish.some((term) => !seenTerms.has(term.toLocaleLowerCase()))) {
      signals.add("newTerm");
    }
    for (const term of termish) seenTerms.add(term.toLocaleLowerCase());
  }

  if (signals.size === 0) return null;
  // A block with only positional weight is not a suggestion.
  if (signals.size === 1 && signals.has("opensSection")) return null;
  // `- **Assets**` heading a sub-list is a key point despite being one word,
  // so the prose-length floor only applies when nothing named a term.
  const minimumWords = signals.has("boldTerm") ? 1 : 4;
  if (wordCount(trimmed) < minimumWords) return null;

  const kind: SuggestionKind =
    signals.has("claim") || signals.has("defining")
      ? "definition"
      : signals.has("result")
        ? "result"
        : "term";

  const span = pickSpan(block);
  // `==…==` never spans a line, so neither can a suggestion.
  if (!span.text || span.text.includes("\n")) {
    return null;
  }

  return { block, signals, kind, span };
}

/**
 * The scoring step that the naive version lacked.
 *
 * `weight(signal) = base * log(1 + candidates / (1 + firings))`. A signal that
 * fires in almost every candidate approaches zero weight, so "is a
 * proposition" stops being evidence in a note that is entirely propositions.
 */
function scoreCandidates(candidates: Candidate[]): number[] {
  const firings = new Map<Signal, number>();
  for (const candidate of candidates) {
    for (const signal of candidate.signals) {
      firings.set(signal, (firings.get(signal) ?? 0) + 1);
    }
  }

  const total = candidates.length;
  return candidates.map((candidate) => {
    let score = 0;
    for (const signal of candidate.signals) {
      const rarity = Math.log(1 + total / (1 + (firings.get(signal) ?? 0)));
      score += BASE_WEIGHT[signal] * rarity;
    }
    // Long spans make poor highlights.
    const words = wordCount(candidate.span.text);
    if (words > 30) score *= 30 / words;
    return score;
  });
}

/**
 * How many suggestions a note of this size should get.
 *
 * Never more than a quarter of the blocks: marking most of a note conveys
 * nothing. A note with fewer than four blocks gets none at all, because there
 * is nothing to rank against — the earlier version forced two suggestions onto
 * two-block notes and "highlighted" 79% of them.
 */
export function suggestionBudget(blockCount: number) {
  if (blockCount < 4) return 0;
  return Math.min(8, Math.floor(blockCount * 0.25));
}

export type DetectOptions = {
  /** Override the per-note budget. */
  limit?: number;
};

/**
 * Rank the points in a note worth marking, best first.
 *
 * Spans already inside a `==highlight==`, a code region, or math are skipped:
 * there is no point suggesting what the user has already marked.
 */
export function detectHighlightSuggestions(
  markdown: string,
  options: DetectOptions = {},
): HighlightSuggestion[] {
  if (!markdown.trim()) return [];

  const codeRanges = findCodeRanges(markdown);
  const mathRanges = findMathRanges(markdown, codeRanges);
  const existing = findHighlightRanges(markdown).map((highlight) => ({
    from: highlight.from,
    to: highlight.to,
  }));

  const blocks = splitIntoBlocks(markdown);
  const seenTerms = new Set<string>();
  const candidates: Candidate[] = [];

  for (const block of blocks) {
    if (insideAny(codeRanges, block.from, block.to)) continue;
    const candidate = classify(block, seenTerms);
    if (!candidate) continue;
    const { from, to } = candidate.span;
    if (insideAny(existing, from, to) || existing.some((range) => from < range.to && to > range.from)) continue;
    if (insideAny(mathRanges, from, to)) continue;
    candidates.push(candidate);
  }

  if (candidates.length === 0) return [];

  const scores = scoreCandidates(candidates);
  const ranked = candidates
    .map((candidate, index) => ({ candidate, score: scores[index] ?? 0 }))
    // Ties are common in a note where every candidate carries the same
    // signals. Break them on document order so the result is stable and the
    // earliest statement of an idea wins.
    .toSorted((a, b) => b.score - a.score || a.candidate.span.from - b.candidate.span.from);

  const limit = options.limit ?? suggestionBudget(blocks.length);
  return ranked.slice(0, limit).map(({ candidate, score }) => ({
    from: candidate.span.from,
    to: candidate.span.to,
    text: candidate.span.text,
    kind: candidate.kind,
    score: Number(score.toFixed(3)),
  }));
}
