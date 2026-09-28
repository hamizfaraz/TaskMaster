import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the fake model will do on the next run. */
const scripted = vi.hoisted(() => ({
  submit: null as unknown,
  text: "",
  throws: false,
}));

vi.mock("@ai-sdk/google", () => ({ google: () => ({ modelId: "fake" }) }));

vi.mock("ai", () => ({
  stepCountIs: () => () => true,
  tool: (config: unknown) => config,
  ToolLoopAgent: class {
    settings: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> };
    constructor(settings: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> }) {
      this.settings = settings;
    }
    async generate() {
      if (scripted.throws) {
        throw new Error("model unavailable");
      }
      if (scripted.submit) {
        await this.settings.tools.submitPoints!.execute(scripted.submit);
      }
      return { text: scripted.text };
    }
  },
}));

import { runKeyPointAgent } from "@/lib/agent/key-point-agent";

const markdown = [
  "## Statement of Cash Flows",
  "",
  "- Reports inflows and outflows of cash during the accounting period.",
  "- Like the income statement, it covers a period of time.",
  "- The ==sentinel value== is already marked.",
  "",
  "```c",
  "if ( a == b ) { return 1; }",
  "```",
].join("\n");

const run = (budget = 5) =>
  runKeyPointAgent({
    title: "Statement of Cash Flows",
    markdown,
    budget,
    context: "no syllabus",
    environment: { syllabus: async () => null, siblingTitles: async () => [] },
  });

const point = (text: string, reason = "because") => ({ text, kind: "definition" as const, reason });

beforeEach(() => {
  scripted.submit = null;
  scripted.text = "";
  scripted.throws = false;
});

describe("runKeyPointAgent", () => {
  it("returns verified spans with offsets that address the note", async () => {
    scripted.submit = { points: [point("Reports inflows and outflows of cash during the accounting period.")] };

    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [suggestion] = result.suggestions;
    expect(suggestion?.source).toBe("agent");
    expect(suggestion?.reason).toBe("because");
    expect(markdown.slice(suggestion!.from, suggestion!.to)).toBe(suggestion!.text);
  });

  it("drops text the model invented rather than quoted", async () => {
    // The failure mode that matters. The agent has a verification tool, but
    // nothing it claims is trusted: the server checks every span again.
    scripted.submit = {
      points: [
        point("Reports the inflows and outflows of cash."), // paraphrased
        point("Like the income statement, it covers a period of time."), // verbatim
      ],
    };

    const result = await run();
    expect(result.ok && result.suggestions.map((s) => s.text)).toEqual([
      "Like the income statement, it covers a period of time.",
    ]);
  });

  it("drops spans inside code, and text already highlighted", async () => {
    scripted.submit = {
      points: [point("if ( a == b ) { return 1; }"), point("sentinel value")],
    };
    const result = await run();
    expect(result.ok && result.suggestions).toEqual([]);
  });

  it("enforces the budget outside the model", async () => {
    scripted.submit = {
      points: [
        point("Reports inflows and outflows of cash during the accounting period."),
        point("Like the income statement, it covers a period of time."),
      ],
    };
    const result = await run(1);
    expect(result.ok && result.suggestions).toHaveLength(1);
  });

  it("falls back to parsing prose when the model never calls submitPoints", async () => {
    // Weaker models answer in prose often enough that discarding the run wastes
    // the work. Every span is re-verified regardless.
    scripted.text = `Here you go:
{"points":[{"text":"Like the income statement, it covers a period of time.","kind":"result","reason":"period vs point in time"}]}`;

    const result = await run();
    expect(result.ok && result.suggestions.map((s) => s.text)).toEqual([
      "Like the income statement, it covers a period of time.",
    ]);
  });

  it("reports failure rather than throwing when the model is unavailable", async () => {
    scripted.throws = true;
    expect(await run()).toEqual({ ok: false, reason: "failed" });
  });

  it("reports failure when nothing usable came back at all", async () => {
    scripted.text = "I could not find anything.";
    expect(await run()).toEqual({ ok: false, reason: "failed" });
  });

  it("returns an empty list when the model correctly proposes nothing", async () => {
    scripted.submit = { points: [] };
    expect(await run()).toEqual({ ok: true, suggestions: [] });
  });
});
