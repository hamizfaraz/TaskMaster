import { describe, expect, it } from "vitest";
import { extractHighlights, findHighlightRanges } from "@/lib/notes/highlights";

const textsOf = (markdown: string) => findHighlightRanges(markdown).map((h) => h.text);

describe("findHighlightRanges", () => {
  it("finds a highlight and reports where it is", () => {
    const markdown = "The ==least upper bound axiom== matters.";
    expect(findHighlightRanges(markdown)).toEqual([
      { text: "least upper bound axiom", from: 4, to: 31 },
    ]);
    expect(markdown.slice(4, 31)).toBe("==least upper bound axiom==");
  });

  it("ignores == inside a fenced code block", () => {
    // The only `==` in this project's real note corpus is exactly this shape.
    const markdown = ["Before", "", "```c", "if ( s[ root1 ] == s[ root2 ] )", "```", "", "After"].join("\n");
    expect(textsOf(markdown)).toEqual([]);
  });

  it("ignores == inside an inline code span", () => {
    expect(textsOf("In C, `a == b` tests equality.")).toEqual([]);
  });

  it("ignores == inside math", () => {
    expect(textsOf("Compare $a == b$ here.")).toEqual([]);
    expect(textsOf(["$$", "a == b", "$$"].join("\n"))).toEqual([]);
  });

  it("takes several highlights on one line, in order", () => {
    expect(textsOf("Both ==alpha== and ==beta== matter.")).toEqual(["alpha", "beta"]);
  });

  it("does not span a newline", () => {
    expect(textsOf("==open\nclose==")).toEqual([]);
  });

  it("ignores an unterminated or empty marker", () => {
    expect(textsOf("An ==unterminated highlight")).toEqual([]);
    expect(textsOf("Empty ==== marker")).toEqual([]);
    expect(textsOf("Spaces ==   == only")).toEqual([]);
  });

  it("keeps a highlight that wraps inline math", () => {
    expect(textsOf("Recall ==the identity $e^{i\\pi} = -1$== from lecture.")).toEqual([
      "the identity $e^{i\\pi} = -1$",
    ]);
  });

  it("finds highlights inside list items and headings", () => {
    const markdown = ["## A ==key== heading", "", "- a ==marked== item"].join("\n");
    expect(textsOf(markdown)).toEqual(["key", "marked"]);
  });
});

describe("extractHighlights", () => {
  it("de-duplicates case-insensitively and preserves first-seen wording", () => {
    expect(extractHighlights("==Handle== then ==handle== then ==Parser==")).toEqual([
      "Handle",
      "Parser",
    ]);
  });

  it("caps the list so one note cannot crowd out a prompt", () => {
    const markdown = Array.from({ length: 50 }, (_, index) => `==term ${index}==`).join(" ");
    expect(extractHighlights(markdown)).toHaveLength(40);
    expect(extractHighlights(markdown, 5)).toEqual([
      "term 0",
      "term 1",
      "term 2",
      "term 3",
      "term 4",
    ]);
  });

  it("returns nothing for a note with no highlights", () => {
    expect(extractHighlights("Plain prose with $x^2$ and `code`.")).toEqual([]);
  });
});
