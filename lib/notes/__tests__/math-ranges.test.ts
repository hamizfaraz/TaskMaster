import { describe, expect, it } from "vitest";
import { findCodeRanges, findMathRanges, normalizeMarkdownMath } from "@/lib/notes/math-ranges";

describe("findMathRanges", () => {
  it("finds inline math on a line and reports exact delimiter and content offsets", () => {
    const text = "The area is $A = \\pi r^2$ and the sum is $x_1 + x_2$.";
    const ranges = findMathRanges(text);

    expect(ranges).toEqual([
      { from: 12, to: 25, contentFrom: 13, contentTo: 24, display: false, latex: "A = \\pi r^2" },
      { from: 41, to: 52, contentFrom: 42, contentTo: 51, display: false, latex: "x_1 + x_2" },
    ]);
    expect(text.slice(ranges[0]!.from, ranges[0]!.to)).toBe("$A = \\pi r^2$");
  });

  it("finds display math on its own lines (the generator's shape) and inline $$…$$", () => {
    const fenced = "Before\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\nAfter";
    const [display] = findMathRanges(fenced);
    expect(display).toMatchObject({ display: true, latex: "\\sum_{i=1}^{n} i" });
    expect(fenced.slice(display!.from, display!.to)).toBe("$$\n\\sum_{i=1}^{n} i\n$$");

    expect(findMathRanges("Inline $$E = mc^2$$ here")).toEqual([
      { from: 7, to: 19, contentFrom: 9, contentTo: 17, display: true, latex: "E = mc^2" },
    ]);
  });

  it("applies Pandoc's rule: currency and shell variables are prose, single letters are math", () => {
    expect(findMathRanges("I paid $5.99 and $6.99 today")).toEqual([]);
    expect(findMathRanges("Set $HOME and $PATH first")).toEqual([]);
    expect(findMathRanges("Between $5 and $6.")).toEqual([]);
    expect(findMathRanges("Let $x$ and $n$ be integers with $x^2$ and $a + b$")).toHaveLength(4);
    expect(findMathRanges("Padded $ x $ is not math")).toEqual([]);
  });

  it("ignores escaped dollars, unterminated delimiters, and line-crossing inline math", () => {
    expect(findMathRanges("Costs \\$5 and \\$6")).toEqual([]);
    expect(findMathRanges("An unterminated $x + y")).toEqual([]);
    expect(findMathRanges("Unterminated display $$x + y")).toEqual([]);
    expect(findMathRanges("open $x\ny$ closed")).toEqual([]);
  });

  it("never treats the inside of code as math", () => {
    const text = ["```bash", "echo $HOME", "export P=$PATH", "```", "", "and `$x^2$` inline, but $y^2$"].join("\n");

    expect(findMathRanges(text).map((range) => range.latex)).toEqual(["y^2"]);
  });

  it("honours extra excluded ranges from the caller", () => {
    expect(findMathRanges("$a^2$ and $b^2$", [{ from: 0, to: 5 }])).toEqual([
      expect.objectContaining({ latex: "b^2" }),
    ]);
  });
});

describe("findCodeRanges", () => {
  it("covers fenced blocks (to the closing fence or EOF) and inline spans", () => {
    const text = "a `x` b\n```\n$1\n```\nc ``y`z`` d\n~~~\nopen";
    const ranges = findCodeRanges(text).map((range) => text.slice(range.from, range.to));

    expect(ranges).toEqual(["`x`", "```\n$1\n```", "``y`z``", "~~~\nopen"]);
  });
});

describe("normalizeMarkdownMath", () => {
  it("normalizes typed math inside regions and leaves prose untouched", () => {
    expect(normalizeMarkdownMath("Use $√(x²)$ and  keep   these spaces.")).toBe(
      "Use $\\sqrt{x^2}$ and  keep   these spaces.",
    );
  });

  it("normalizes display math line by line and keeps the fence layout", () => {
    expect(normalizeMarkdownMath("$$\nα ≤ β\nγ ≥ δ\n$$")).toBe(
      "$$\n\\alpha \\le \\beta\n\\gamma \\ge \\delta\n$$",
    );
  });

  it("is byte-for-byte identity for code containing dollar signs and for currency", () => {
    const code = ["```bash", "echo   $HOME", "export  P=$PATH  # keep spacing", "```"].join("\n");
    expect(normalizeMarkdownMath(code)).toBe(code);

    const currency = "It costs $5 and  $6, not $7.";
    expect(normalizeMarkdownMath(currency)).toBe(currency);
  });

  it("is idempotent", () => {
    const once = normalizeMarkdownMath("Mix $√2$, `$x$`, and\n\n$$\nπ r²\n$$");
    expect(normalizeMarkdownMath(once)).toBe(once);
  });
});
