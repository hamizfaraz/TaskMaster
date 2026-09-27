import { describe, expect, it } from "vitest";
import { parseMarkdownToNoteDocument } from "@/lib/notes/parse-markdown";
import { normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";
import { sanitizeStoredText } from "@/lib/notes/sanitize";

// The shape that actually failed: a NUL the model emitted inside a cases block.
// Postgres answered `22P05 ... \u0000 cannot be converted to text`.
const withNul =
  "$$\nx[n] = \\begin{cases} Aa^n, & n \\geq 0, \u0000 \\\\ 0 & \\text{otherwise}\\end{cases}\n$$";

describe("sanitizeStoredText", () => {
  it("removes the NUL that broke the insert", () => {
    expect(withNul).toContain("\u0000");
    expect(sanitizeStoredText(withNul)).not.toContain("\u0000");
  });

  it("keeps the surrounding LaTeX byte-for-byte", () => {
    // The point is to drop one character, not to rewrite the maths around it.
    expect(sanitizeStoredText(withNul)).toBe(withNul.replace("\u0000", ""));
  });

  it("keeps tab, newline and carriage return", () => {
    expect(sanitizeStoredText("a\tb\nc\r\nd")).toBe("a\tb\nc\r\nd");
  });

  it("turns a form feed into a line break rather than dropping it", () => {
    // Form feed is a page break in scanned output; deleting it would run the
    // last line of one page into the first line of the next.
    expect(sanitizeStoredText("page one\fpage two")).toBe("page one\npage two");
  });

  it("strips other control characters that carry no meaning in a note", () => {
    expect(sanitizeStoredText("a\u0001b\u001Fc\u007Fd")).toBe("abcd");
  });

  it("repairs a lone surrogate from a truncated response", () => {
    // Half a surrogate pair is not valid UTF-8, and Postgres rejects it for the
    // same reason as a NUL.
    const truncated = "complete 😀 then cut \uD800";
    const cleaned = sanitizeStoredText(truncated);
    expect(cleaned.isWellFormed()).toBe(true);
    expect(cleaned).toContain("😀");
  });

  it("leaves ordinary note text alone", () => {
    const md = "# Heading\n\n- $x^2$ and **bold** — em dash, café, 日本語\n";
    expect(sanitizeStoredText(md)).toBe(md);
  });
});

describe("storing content that contained a NUL", () => {
  it("produces a block document that is safe to serialize as jsonb", () => {
    const dirty = JSON.stringify(parseMarkdownToNoteDocument(withNul));
    expect(dirty).toContain("\\u0000");

    const clean = JSON.stringify(normalizeNoteWriteMarkdown(withNul).document);
    expect(clean).not.toContain("\\u0000");
  });

  it("produces a markdown column that is safe to store as text", () => {
    expect(normalizeNoteWriteMarkdown(withNul).markdown).not.toContain("\u0000");
  });
});
