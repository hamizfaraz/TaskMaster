import { describe, expect, it } from "vitest";
import { normalizeLatex, normalizeTextMathToLatex } from "@/lib/math/latex";

describe("latex normalization", () => {
  it("converts common typed math symbols to LaTeX", () => {
    expect(normalizeLatex("√(x² + y₂) ≤ π")).toBe("\\sqrt{x^2 + y_2} \\le \\pi");
  });

  it("normalizes only delimited math inside text", () => {
    expect(normalizeTextMathToLatex("Use $√(x²)$ and then save.")).toBe(
      "Use $\\sqrt{x^2}$ and then save.",
    );
  });

  it("normalizes display math delimiters", () => {
    expect(normalizeTextMathToLatex("$$\nα + β ≥ γ\n$$")).toBe(
      "$$\n\\alpha + \\beta \\ge \\gamma\n$$",
    );
  });
});
