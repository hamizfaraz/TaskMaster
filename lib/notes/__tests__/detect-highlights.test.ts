import { describe, expect, it } from "vitest";
import { detectHighlightSuggestions, splitIntoBlocks, suggestionBudget } from "@/lib/notes/detect-highlights";
import { extractHighlights } from "@/lib/notes/highlights";

const lines = (...parts: string[]) => parts.join("\n");

/** Applying a suggestion, the way the editor does. */
const accept = (markdown: string, s: { from: number; to: number; text: string }) =>
  `${markdown.slice(0, s.from)}==${s.text}==${markdown.slice(s.to)}`;

describe("suggestionBudget", () => {
  it("says nothing about a note too short to rank", () => {
    // The first version forced two suggestions onto two-block notes and so
    // "highlighted" 79% of them.
    expect(suggestionBudget(0)).toBe(0);
    expect(suggestionBudget(3)).toBe(0);
  });

  it("never marks more than a quarter of the blocks, and caps out", () => {
    expect(suggestionBudget(8)).toBe(2);
    expect(suggestionBudget(20)).toBe(5);
    expect(suggestionBudget(400)).toBe(8);
  });
});

describe("detectHighlightSuggestions", () => {
  it("finds a definition stated in prose with a bold term", () => {
    // Exactly the case the unranked version walked past.
    const markdown = lines(
      "## Bottom-Up Parsing",
      "",
      "- Produces the reverse of a rightmost derivation.",
      "- The parser must find the right-hand side, called the **handle**, in the sentential form.",
      "- Consider the grammar below.",
      "- The parse stack holds partial results.",
      "- Input is read left to right.",
      "- A shift moves a token onto the stack.",
    );

    const [top] = detectHighlightSuggestions(markdown);
    expect(top?.text).toContain("handle");
  });

  it("does not flood a note where every block looks important", () => {
    // Twenty propositions: being a proposition cannot be what distinguishes
    // one of them, so the note must not come back almost entirely marked.
    const markdown = Array.from(
      { length: 20 },
      (_, index) => `**Proposition.** Statement number ${index} holds for all $n$.`,
    ).join("\n\n");

    const suggestions = detectHighlightSuggestions(markdown);
    expect(suggestions.length).toBeLessThanOrEqual(suggestionBudget(20));
    expect(suggestions.length).toBeLessThan(20);
  });

  it("ranks a named claim above an anonymous one", () => {
    const markdown = lines(
      "**Proposition.** The sequence is bounded above by two.",
      "",
      "**Theorem (Axiom of Archimedes).** For every real there is a larger natural.",
      "",
      "**Proposition.** The sequence is monotonic increasing.",
      "",
      "**Proposition.** The limit exists and is unique.",
      "",
      "**Proposition.** Every subsequence converges to it.",
    );

    const [top] = detectHighlightSuggestions(markdown);
    expect(top?.text).toContain("Archimedes");
  });

  it("returns spans that can be accepted and read back as highlights", () => {
    const markdown = lines(
      "## Disjoint Sets",
      "",
      "- Union by size guarantees that tree depth will never exceed log N.",
      "- A node joins a sub-tree of equal or larger size.",
      "- The array is initialised to minus one.",
      "- Kruskal uses the structure to detect cycles.",
      "- Two operations are supported.",
      "- The backing store is a single array.",
    );

    for (const suggestion of detectHighlightSuggestions(markdown)) {
      expect(markdown.slice(suggestion.from, suggestion.to)).toBe(suggestion.text);
      expect(suggestion.text).not.toContain("\n");
      expect(extractHighlights(accept(markdown, suggestion))).toContain(suggestion.text);
    }
  });

  it("never suggests display math, which no highlight could wrap", () => {
    const markdown = lines(
      "## Results",
      "",
      "$$",
      "\\nabla \\times F = 0",
      "$$",
      "",
      "- The field is conservative when the curl vanishes.",
      "- A potential therefore exists.",
      "- Line integrals become path independent.",
      "- The converse needs simple connectedness.",
    );

    for (const suggestion of detectHighlightSuggestions(markdown)) {
      expect(suggestion.text.startsWith("$$")).toBe(false);
    }
  });

  it("skips code, and text the user already highlighted", () => {
    const markdown = lines(
      "## Notes",
      "",
      "```c",
      "if ( s[ root1 ] == s[ root2 ] ) { /* a handle is called here */ }",
      "```",
      "",
      "- The ==sentinel value is defined as minus one== already.",
      "- A second point that is called something.",
      "- Filler one.",
      "- Filler two.",
      "- Filler three.",
      "- Filler four.",
    );

    const suggestions = detectHighlightSuggestions(markdown);
    expect(suggestions.some((s) => s.text.includes("root1"))).toBe(false);
    expect(suggestions.some((s) => s.text.includes("sentinel value"))).toBe(false);
  });

  it("returns nothing for an empty or featureless note", () => {
    expect(detectHighlightSuggestions("")).toEqual([]);
    expect(detectHighlightSuggestions("   \n\n  ")).toEqual([]);
    expect(detectHighlightSuggestions(lines("one", "", "two", "", "three", "", "four"))).toEqual([]);
  });

  it("honours an explicit limit", () => {
    const markdown = Array.from(
      { length: 40 },
      (_, index) => `**Definition ${index}.** A term that is called thing ${index}.`,
    ).join("\n\n");
    expect(detectHighlightSuggestions(markdown, { limit: 3 })).toHaveLength(3);
  });
});

describe("splitIntoBlocks", () => {
  it("keeps a fence and a display-math block whole", () => {
    const markdown = lines("text", "", "```js", "const a = 1;", "", "const b = 2;", "```", "", "$$", "x = 1", "", "y = 2", "$$");
    const texts = splitIntoBlocks(markdown).map((block) => block.text);
    expect(texts.some((text) => text.includes("const a") && text.includes("const b"))).toBe(true);
    expect(texts.some((text) => text.includes("x = 1") && text.includes("y = 2"))).toBe(true);
  });

  it("gives each list item its own block so a suggestion can land on one", () => {
    const blocks = splitIntoBlocks(lines("- first", "- second", "- third"));
    expect(blocks).toHaveLength(3);
  });

  it("reports offsets that address the original text", () => {
    const markdown = lines("alpha", "", "beta");
    for (const block of splitIntoBlocks(markdown)) {
      expect(markdown.slice(block.from, block.to)).toContain(block.text.trim());
    }
  });
});
