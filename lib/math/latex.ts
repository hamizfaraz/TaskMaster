const UNICODE_LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/≤/g, "\\le "],
  [/≥/g, "\\ge "],
  [/≠/g, "\\ne "],
  [/≈/g, "\\approx "],
  [/±/g, "\\pm "],
  [/×/g, "\\times "],
  [/÷/g, "\\div "],
  [/∞/g, "\\infty "],
  [/π/g, "\\pi "],
  [/Π/g, "\\Pi "],
  [/θ/g, "\\theta "],
  [/Θ/g, "\\Theta "],
  [/λ/g, "\\lambda "],
  [/Λ/g, "\\Lambda "],
  [/μ/g, "\\mu "],
  [/σ/g, "\\sigma "],
  [/Σ/g, "\\Sigma "],
  [/Ω/g, "\\Omega "],
  [/√\s*\(([^()\n]+)\)/g, "\\sqrt{$1}"],
  [/√\s*([A-Za-z0-9]+)/g, "\\sqrt{$1}"],
  [/∑/g, "\\sum "],
  [/∫/g, "\\int "],
  [/→/g, "\\to "],
  [/⇒/g, "\\Rightarrow "],
  [/∈/g, "\\in "],
  [/∉/g, "\\notin "],
  [/∂/g, "\\partial "],
  [/∇/g, "\\nabla "],
  [/∆/g, "\\Delta "],
  [/α/g, "\\alpha "],
  [/β/g, "\\beta "],
  [/γ/g, "\\gamma "],
  [/δ/g, "\\delta "],
];

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

function normalizeScriptDigits(value: string, digits: Record<string, string>, marker: "^" | "_") {
  const scriptChars = Object.keys(digits).join("");
  const pattern = new RegExp(`[${scriptChars}]+`, "g");

  return value.replace(pattern, (match) => {
    const normalized = [...match].map((char) => digits[char] ?? char).join("");
    return normalized.length === 1 ? `${marker}${normalized}` : `${marker}{${normalized}}`;
  });
}

function normalizeLatexSegment(value: string) {
  let normalized = value;

  for (const [pattern, replacement] of UNICODE_LATEX_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalizeScriptDigits(normalized, SUPERSCRIPT_DIGITS, "^");
  normalized = normalizeScriptDigits(normalized, SUBSCRIPT_DIGITS, "_");
  normalized = normalized.replace(/\s+([_^])/g, "$1");
  normalized = normalized.replace(/([_^])\s+/g, "$1");
  normalized = normalized.replace(/[ \t]{2,}/g, " ");

  return normalized.trim();
}

function normalizeDelimitedMath(value: string) {
  return value.replace(/(\${1,2})([\s\S]*?)(\1)/g, (match, delimiter: string, content: string) => {
    if (!content.trim()) {
      return match;
    }

    const normalized = normalizeLatexSegment(content);
    if (delimiter === "$$") {
      return `$$\n${normalized}\n$$`;
    }

    return `$${normalized}$`;
  });
}

export function normalizeLatex(value: string) {
  return normalizeLatexSegment(value);
}

export function normalizeTextMathToLatex(value: string) {
  return normalizeDelimitedMath(value);
}
