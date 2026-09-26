import type { KeyPointCase } from "@/lib/notes/__tests__/fixtures/key-point-eval";

/**
 * Score a key-point detector against the evaluation set.
 *
 * Recall is what matters here: the point of a more expensive detector is to
 * find things the free ranker misses. Noise is bounded separately by the
 * per-note budget, so `suggested` is reported alongside rather than folded
 * into one number that would hide which of the two moved.
 */
export type DetectorResult = { text: string };

export type CaseScore = {
  name: string;
  weak: boolean;
  /** Expected points this detector covered. */
  found: number;
  expected: number;
  /** How many suggestions it made in total. */
  suggested: number;
  /** Expected fragments it missed, for eyeballing. */
  missed: string[];
};

export type EvalScore = {
  cases: CaseScore[];
  /** Recall over every case. */
  recall: number;
  /** Recall over the cases the ranker handles badly — the ones that matter. */
  weakRecall: number;
  /** Total suggestions made, the cost side of the trade. */
  suggested: number;
};

const normalise = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** An expected point is covered when some suggestion contains its fragment. */
function covers(suggestions: DetectorResult[], fragment: string) {
  const needle = normalise(fragment);
  return suggestions.some((suggestion) => normalise(suggestion.text).includes(needle));
}

export function scoreDetector(
  cases: readonly KeyPointCase[],
  detect: (markdown: string) => DetectorResult[],
): EvalScore {
  const scored: CaseScore[] = cases.map((testCase) => {
    const suggestions = detect(testCase.markdown);
    const missed = testCase.expected.filter((fragment) => !covers(suggestions, fragment));
    return {
      name: testCase.name,
      weak: testCase.weak,
      found: testCase.expected.length - missed.length,
      expected: testCase.expected.length,
      suggested: suggestions.length,
      missed,
    };
  });

  const ratio = (rows: CaseScore[]) => {
    const expected = rows.reduce((sum, row) => sum + row.expected, 0);
    const found = rows.reduce((sum, row) => sum + row.found, 0);
    return expected === 0 ? 1 : found / expected;
  };

  return {
    cases: scored,
    recall: ratio(scored),
    weakRecall: ratio(scored.filter((row) => row.weak)),
    suggested: scored.reduce((sum, row) => sum + row.suggested, 0),
  };
}

/** Rendered for a script or a test failure message. */
export function formatEvalScore(label: string, score: EvalScore) {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const header = `${label}: recall ${pct(score.recall)}  (weak cases ${pct(score.weakRecall)})  ${score.suggested} suggestions`;
  const rows = score.cases.map(
    (row) =>
      `  ${row.found === row.expected ? "ok  " : "MISS"} ${row.found}/${row.expected}` +
      ` ${row.weak ? "[weak] " : "       "}${row.name}` +
      (row.missed.length > 0 ? `\n         missed: ${row.missed.map((m) => JSON.stringify(m)).join(", ")}` : ""),
  );
  return [header, ...rows].join("\n");
}
