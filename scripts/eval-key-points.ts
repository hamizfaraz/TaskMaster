/**
 * Does the agent beat the free ranker on the cases the ranker cannot handle?
 *
 * That question decides whether the agent ships at all, so it is answered by
 * running both over the fixed set in
 * `lib/notes/__tests__/fixtures/key-point-eval.ts` rather than by impression.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/eval-key-points.ts
 *
 * A tool loop spends several requests per note and Gemini's free tier allows
 * 10-20 a minute, so the run is paced. Expect it to take a few minutes, and
 * expect 429s if anything else has used the key recently.
 */
import { keyPointCases } from "@/lib/notes/__tests__/fixtures/key-point-eval";
import { formatEvalScore, scoreDetector } from "@/lib/notes/key-point-eval";
import { detectHighlightSuggestions, splitIntoBlocks, suggestionBudget } from "@/lib/notes/detect-highlights";
import { runKeyPointAgent } from "@/lib/agent/key-point-agent";
import { getRankerCandidates } from "@/lib/agent/key-point-context";

const ACCOUNTING = {
  courseTitle: "ACCT2301 INTRODUCTORY FINANCIAL ACCOUNTING",
  concepts: ["Financial Statements", "Balance Sheet", "Income Statement", "Statement of Cash Flows", "Revenue Recognition"],
  grading: [
    { label: "Exam I", weightPercent: 33 },
    { label: "Exam II", weightPercent: 33 },
    { label: "In-Class Quizzes", weightPercent: 24 },
  ],
};

const isAccounting = (name: string) => /cash flows|equity|financial|relationships/i.test(name);

function buildContext(markdown: string, name: string) {
  const candidates = getRankerCandidates(markdown);
  const head = candidates.length > 0
    ? "The lexical ranker suggests:\n" + candidates.map((c) => "- [" + c.kind + " " + c.score + "] " + c.text).join("\n")
    : "The lexical ranker found nothing in this note. That is why you were asked.";
  const tail = isAccounting(name)
    ? "Course: " + ACCOUNTING.courseTitle
      + "\nSyllabus concepts: " + ACCOUNTING.concepts.join(", ")
      + "\nAssessment weights: " + ACCOUNTING.grading.map((g) => g.label + " " + g.weightPercent + "%").join(", ")
    : "This note is not linked to a course, so there is no syllabus context.";
  return head + "\n\n" + tail;
}

async function main() {
  const weakCases = keyPointCases.filter((c) => c.weak);
  const ranker = scoreDetector(weakCases, (md) => detectHighlightSuggestions(md));
  console.log(formatEvalScore("ranker", ranker));

  const results = new Map<string, { text: string }[]>();
  for (const testCase of weakCases) {
    const budget = Math.max(1, suggestionBudget(splitIntoBlocks(testCase.markdown).length) || 3);
    const result = await runKeyPointAgent({
      title: testCase.name,
      markdown: testCase.markdown,
      budget,
      context: buildContext(testCase.markdown, testCase.name),
      environment: {
        syllabus: async () => (isAccounting(testCase.name) ? ACCOUNTING : null),
        siblingTitles: async () => (isAccounting(testCase.name) ? ["Balance Sheet", "Income Statement"] : []),
      },
    });
    results.set(testCase.name, result.ok ? result.suggestions : []);
    if (!result.ok) console.log("  (agent failed on \"" + testCase.name + "\": " + result.reason + ")");
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }

  const agentScore = scoreDetector(weakCases, (md) => {
    const match = weakCases.find((c) => c.markdown === md);
    return results.get(match?.name ?? "") ?? [];
  });
  console.log("\n" + formatEvalScore("agent ", agentScore));

  console.log("\n--- what the agent picked ---");
  for (const [name, points] of results) {
    console.log("\n" + name);
    if (points.length === 0) console.log("   (nothing)");
    for (const p of points) console.log("   - " + p.text.slice(0, 96));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
