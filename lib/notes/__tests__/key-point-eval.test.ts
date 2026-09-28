import { describe, expect, it } from "vitest";
import { keyPointCases } from "@/lib/notes/__tests__/fixtures/key-point-eval";
import { formatEvalScore, scoreDetector } from "@/lib/notes/key-point-eval";
import { detectHighlightSuggestions } from "@/lib/notes/detect-highlights";

const rankerScore = () =>
  scoreDetector(keyPointCases, (markdown) => detectHighlightSuggestions(markdown));

describe("key-point evaluation set", () => {
  it("scores the free ranker, recording the baseline a costlier detector must beat", () => {
    const score = rankerScore();
    // Measured baseline: 30% overall, 0% on the weak cases, 4 suggestions.
    // Printed on failure so a regression shows exactly what moved.
    expect(score.recall, formatEvalScore("ranker", score)).toBeGreaterThanOrEqual(0.3);
    // The weak cases are the entire reason a costlier detector would exist.
    // If this ever climbs on its own, the agent's case gets weaker — which
    // would be good news, and should be noticed rather than assumed away.
    expect(score.weakRecall, formatEvalScore("ranker", score)).toBeLessThan(0.5);
  });

  it("gives full credit for correctly finding nothing", () => {
    const score = scoreDetector(
      keyPointCases.filter((c) => c.expected.length === 0),
      () => [],
    );
    expect(score.recall).toBe(1);
  });

  it("counts a suggestion as covering a point when it contains the fragment", () => {
    const score = scoreDetector(
      [{ name: "t", weak: false, markdown: "", expected: ["cheapest edge"] }],
      () => [{ text: "Kruskal adds the CHEAPEST  EDGE that forms no cycle." }],
    );
    expect(score.recall).toBe(1);
  });
});
