import { describe, expect, it } from "vitest";
import { ParseTestError } from "../errors";
import { validateSyllabusCandidate } from "./syllabus";

describe("validateSyllabusCandidate", () => {
  it("accepts syllabus abbreviation filenames when the document has a syllabus signal", () => {
    const result = validateSyllabusCandidate(
      "4348-syl.pdf",
      Buffer.from("%PDF-1.3\nSyllabus\n", "utf8"),
    );

    expect(result.isLikelySyllabus).toBe(true);
    expect(result.matchedSignals).toContain("filename:syllabus abbreviation");
    expect(result.matchedSignals).toContain("document:syllabus");
  });

  it("does not let syllabus-looking names override resume signals", () => {
    expect(() =>
      validateSyllabusCandidate(
        "4348-syl.pdf",
        Buffer.from("%PDF-1.3\nSyllabus\nResume\n", "utf8"),
      ),
    ).toThrow(ParseTestError);
  });
});
