import { afterEach, expect, it, vi } from "vitest";
import { extractHighlights } from "@/lib/notes/highlights";
import { findMathRanges } from "@/lib/notes/math-ranges";

const { generateContent, embedContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  embedContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  FinishReason: { MAX_TOKENS: "MAX_TOKENS" },
  GoogleGenAI: class {
    models = { generateContent, embedContent };
  },
}));

import { generateTopicNotesFromFile } from "@/lib/notes/generation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("carries generated points and formula highlights through topic splitting and embedding", async () => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_OCR_MODEL", "ocr");
  vi.stubEnv("GEMINI_PARSE_MODEL", "parse");
  vi.stubEnv("GEMINI_EMBEDDINGS_MODEL", "embed");

  const markdown = "# Energy\n\n==Energy is conserved.==\n\n==Mass–energy equivalence: $E = mc^2$==\n\nA worked example follows.";
  generateContent
    .mockResolvedValueOnce({ text: "Energy is conserved. Mass–energy equivalence: E = mc^2. A worked example follows." })
    .mockResolvedValueOnce({ text: JSON.stringify({ markdown }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ topics: [{ title: "Energy", markdown }] }) });
  embedContent.mockResolvedValue({ embeddings: [{ values: Array(768).fill(1) }] });

  const result = await generateTopicNotesFromFile({
    fileBuffer: Buffer.from("document"),
    fileName: "energy.pdf",
    mimeType: "application/pdf",
  });

  expect(result.topics[0]?.markdown).toBe(markdown);
  expect(extractHighlights(result.topics[0]!.markdown)).toEqual([
    "Energy is conserved.", "Mass–energy equivalence: $E = mc^2$",
  ]);
  expect(findMathRanges(result.topics[0]!.markdown)[0]?.latex).toBe("E = mc^2");
  expect(embedContent.mock.calls[0][0].contents).toEqual([`Energy\n\n${markdown}`]);
  // Both model stages must select highlights, so the final topic output keeps
  // the emphasis even if the first rewrite missed it.
  for (const call of generateContent.mock.calls.slice(1)) {
    const prompt = call[0].contents[0].parts[0].text;
    expect(prompt).toContain("Identify and highlight the most important points and formulas");
    expect(prompt).toContain("==$LaTeX$==");
  }
});
