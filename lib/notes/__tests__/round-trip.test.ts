import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";
import { serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";
import { normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";

/**
 * The block document in `note.content` is a cache derived from the canonical
 * `markdown` column, so `markdown -> blocks -> markdown` has to be the
 * identity. It was not: running the Editor.js-era LaTeX detector over the
 * markdown path flattened rich text (losing every bold on a line that also
 * held math) and promoted ordinary prose into display-math blocks.
 *
 * These fixtures mirror the structures that actually broke in real notes,
 * with the wording replaced. They are written in the serializer's canonical
 * form — `- ` list markers, a blank line after each heading — so the
 * assertion can be exact identity rather than a fuzzy comparison.
 */
const fixtures: Record<string, string> = {
  "bold beside inline math": [
    "## Limits",
    "",
    "A **bounded** sequence with $a_n \\to a$ converges.",
    "",
    "Some **bold text** with $x^2$ inside it.",
  ].join("\n"),

  "list items carrying bold and inline math": [
    "- **Proposition.** $\\mathbb{Q}$ is countable.",
    "- **Theorem.** If $a | bc$ and $(a, b) = 1$, then $a | c$.",
    "- (iii) $i_{\\bar{A}} = 1 - i_A$",
    "- Solution in integers of $ax + by = c$.",
  ].join("\n"),

  "short lines that merely look like math": [
    "In C, a == b tests equality.",
    "",
    "Highlight: ==key idea==",
    "",
    "**b^2:** squared.",
    "",
    "See Figure 3-1.",
  ].join("\n"),

  "escaped punctuation beside inline code": [
    "\\* \\*\\*Author:\\*\\* A. N. Other",
    "",
    "\\* `1. E -> E + T`",
  ].join("\n"),

  "display math keeps its fences": [
    "The chain rule is",
    "",
    "$$",
    "\\frac{df}{dx} = \\frac{dF}{dg} \\frac{dg}{dx}",
    "$$",
    "",
    "where $f$ is differentiable.",
  ].join("\n"),

  "prose that happens to be short and operator-heavy": [
    "where $E_n = O(h^2)$ as $h \\to 0$.",
    "",
    "Assume degree $\\geq 1$ throughout.",
  ].join("\n"),

  "structure blocks": [
    "# Chapter 4",
    "",
    "> A quoted remark with **emphasis**.",
    "",
    "- [ ] unchecked task",
    "- [x] checked task",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "```ts",
    "const x = 1 <= 2;",
    "```",
    "",
    "---",
  ].join("\n"),
};

const boldMarkers = (value: string) => (value.match(/\*\*/g) ?? []).length;
const displayFences = (value: string) => (value.match(/^\$\$$/gm) ?? []).length;

describe("markdown -> blocks -> markdown is the identity", () => {
  for (const [name, markdown] of Object.entries(fixtures)) {
    it(name, () => {
      const out = serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(markdown));
      expect(out.trim()).toBe(markdown.trim());
    });
  }

  it("never drops a bold marker", () => {
    for (const [name, markdown] of Object.entries(fixtures)) {
      const out = serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(markdown));
      expect(boldMarkers(out), `bold lost in "${name}"`).toBe(boldMarkers(markdown));
    }
  });

  it("never invents a display-math fence", () => {
    for (const [name, markdown] of Object.entries(fixtures)) {
      const out = serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(markdown));
      expect(displayFences(out), `spurious $$ in "${name}"`).toBe(displayFences(markdown));
    }
  });

  it("is idempotent: a second pass changes nothing", () => {
    for (const markdown of Object.values(fixtures)) {
      const once = serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(markdown));
      const twice = serializeNoteDocumentToMarkdown(parseMarkdownToNoteDocument(once));
      expect(twice).toBe(once);
    }
  });

  it("the server write path leaves the markdown column untouched", () => {
    for (const markdown of Object.values(fixtures)) {
      expect(normalizeNoteWriteMarkdown(markdown).markdown.trim()).toBe(markdown.trim());
    }
  });
});
