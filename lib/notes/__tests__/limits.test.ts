import { describe, expect, it } from "vitest";
import {
  ContentTooLargeError,
  formatBytes,
  MAX_INLINE_DOCUMENT_BYTES,
  MAX_NOTE_MARKDOWN_CHARS,
  MAX_UPLOAD_FILE_BYTES,
} from "@/lib/notes/limits";
import { normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";

describe("note size limits", () => {
  it("keeps the upload cap below the ceiling it has to respect", () => {
    // Raising MAX_UPLOAD_FILE_BYTES above the inline ceiling would accept files
    // that Gemini then rejects, after the upload has already been paid for.
    expect(MAX_UPLOAD_FILE_BYTES).toBeLessThan(MAX_INLINE_DOCUMENT_BYTES);
  });

  it("leaves base64 headroom under Gemini's 20 MB request limit", () => {
    // Inline bytes inflate by 4/3, plus the prompt and JSON envelope.
    expect((MAX_INLINE_DOCUMENT_BYTES * 4) / 3).toBeLessThan(20 * 1024 * 1024);
  });

  it("allows far more than the largest real note", () => {
    // The biggest note in the corpus is 17,567 characters.
    expect(MAX_NOTE_MARKDOWN_CHARS).toBeGreaterThan(17_567 * 10);
  });

  it("formats sizes for a message a user can act on", () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
  });
});

describe("normalizeNoteWriteMarkdown size guard", () => {
  it("accepts a note at the limit", () => {
    const atLimit = "a".repeat(MAX_NOTE_MARKDOWN_CHARS);
    expect(normalizeNoteWriteMarkdown(atLimit).markdown).toHaveLength(
      MAX_NOTE_MARKDOWN_CHARS,
    );
  });

  it("refuses a note over the limit with a distinguishable error", () => {
    // Distinguishable matters: the routes map this to 413 and a "split it up"
    // message, while a parse failure stays a 400 about invalid content.
    const tooLong = "a".repeat(MAX_NOTE_MARKDOWN_CHARS + 1);
    expect(() => normalizeNoteWriteMarkdown(tooLong)).toThrow(ContentTooLargeError);
  });

  it("still rejects a non-string before measuring it", () => {
    expect(() => normalizeNoteWriteMarkdown(42)).toThrow(/must be a string/);
  });
});
