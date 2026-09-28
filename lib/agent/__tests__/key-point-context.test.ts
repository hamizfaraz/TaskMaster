import { describe, expect, it } from "vitest";
import { verifySpans } from "@/lib/agent/key-point-context";

const markdown = [
  "## Cash Flows",
  "",
  "- Reports inflows and outflows of cash during the accounting period.",
  "- Like the income statement, it covers a period of time.",
  "- The ==sentinel value== is already marked.",
  "",
  "```c",
  "if ( a == b ) { return 1; }",
  "```",
  "",
  "Recall $E = mc^2$ from lecture.",
  "",
  "- A repeated line.",
  "- A repeated line.",
].join("\n");

const verdict = (text: string) => verifySpans(markdown, [text])[0]!;

describe("verifySpans", () => {
  it("accepts a span that appears once, outside code and math", () => {
    const result = verdict("Reports inflows and outflows of cash during the accounting period.");
    expect(result.ok).toBe(true);
    expect(markdown.slice(result.from, result.to)).toBe(result.text);
  });

  it("rejects text the agent invented or paraphrased", () => {
    // The failure mode that matters: a model that rewrites rather than quotes.
    expect(verdict("Reports the inflows and outflows of cash.")).toMatchObject({
      ok: false,
      problem: "does not appear verbatim in the note",
    });
  });

  it("rejects a span covering more than one line", () => {
    expect(verifySpans(markdown, ["- A repeated line.\n- A repeated line."])[0]?.problem).toContain(
      "more than one line",
    );
  });

  it("rejects an ambiguous span that appears twice", () => {
    expect(verdict("A repeated line.")).toMatchObject({
      ok: false,
      problem: "appears more than once; quote more surrounding text",
    });
  });

  it("rejects code and math", () => {
    expect(verdict("if ( a == b ) { return 1; }").problem).toBe("inside code");
    expect(verdict("E = mc^2").problem).toBe("inside math");
  });

  it("rejects text the user already highlighted", () => {
    expect(verdict("sentinel value").problem).toBe("already highlighted");
  });

  it("rejects an empty span", () => {
    expect(verdict("   ").ok).toBe(false);
  });

  it("rejects a second span overlapping the first in the same batch", () => {
    const [first, second] = verifySpans(markdown, [
      "Like the income statement, it covers a period of time.",
      "it covers a period of time.",
    ]);
    expect(first?.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, problem: "overlaps another span in this batch" });
  });

  it("reports one verdict per input, in order", () => {
    const results = verifySpans(markdown, [
      "nope",
      "Reports inflows and outflows of cash during the accounting period.",
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.ok)).toEqual([false, true]);
  });
});
