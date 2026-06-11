import { describe, expect, it } from "vitest";
import { rebalanceGeneratedTopics } from "@/lib/notes/generation";

describe("rebalanceGeneratedTopics", () => {
  it("merges many small generated topics into fewer dense notes", () => {
    const topics = Array.from({ length: 8 }, (_, index) => ({
      title: `Slide ${index + 1}`,
      markdown: `Important detail ${index + 1}. `.repeat(20).trim(),
    }));

    const rebalanced = rebalanceGeneratedTopics(topics);

    expect(rebalanced).toHaveLength(1);
    expect(rebalanced[0]?.title).toBe("Slide 1 + Slide 8");
    expect(rebalanced[0]?.markdown).toContain("## Slide 1");
    expect(rebalanced[0]?.markdown).toContain("## Slide 8");
  });

  it("caps larger documents at four generated notes", () => {
    const topics = Array.from({ length: 12 }, (_, index) => ({
      title: `Topic ${index + 1}`,
      markdown: `Detailed content ${index + 1}. `.repeat(250).trim(),
    }));

    const rebalanced = rebalanceGeneratedTopics(topics);

    expect(rebalanced).toHaveLength(4);
    expect(rebalanced.every((topic) => topic.markdown.length > 1000)).toBe(true);
  });
});
