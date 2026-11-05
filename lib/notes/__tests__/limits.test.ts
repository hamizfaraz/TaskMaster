import { describe, expect, it } from "vitest";
import {
  ContentTooLargeError,
  dataUrlChars,
  formatBytes,
  GENERATION_BUDGET_MS,
  MAX_INLINE_DOCUMENT_BYTES,
  MAX_INLINE_IMAGE_BYTES,
  MAX_NOTE_MARKDOWN_CHARS,
  MAX_UPLOAD_FILE_BYTES,
  remainingNoteChars,
  RETRY_WORK_MARGIN_MS,
  UPLOAD_MAX_DURATION_SECONDS,
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

describe("generation time budget", () => {
  it("leaves the route room to finish after the model calls", () => {
    // The platform kills the handler at maxDuration, so a budget at or above it
    // would trade an error the caller can read for a silent hang. Retries can
    // wait up to a minute each across four steps, which is what made this
    // relationship worth asserting rather than assuming.
    expect(GENERATION_BUDGET_MS).toBeLessThan(UPLOAD_MAX_DURATION_SECONDS * 1000);
    const headroom = UPLOAD_MAX_DURATION_SECONDS * 1000 - GENERATION_BUDGET_MS;
    expect(headroom).toBeGreaterThanOrEqual(30_000);
  });

  it("keeps the retry margin small next to the budget", () => {
    expect(RETRY_WORK_MARGIN_MS).toBeLessThan(GENERATION_BUDGET_MS / 4);
  });
});

describe("inlined image sizing", () => {
  it("counts a data URL the way base64 actually costs", () => {
    // 3 bytes -> 4 characters, plus the data: prefix.
    expect(dataUrlChars(3, "image/png")).toBe("data:image/png;base64,".length + 4);
    expect(dataUrlChars(1, "image/png")).toBe("data:image/png;base64,".length + 4);
    expect(dataUrlChars(3072, "image/png")).toBe("data:image/png;base64,".length + 4096);
  });

  it("reports the room left in a note", () => {
    expect(remainingNoteChars(0)).toBe(MAX_NOTE_MARKDOWN_CHARS);
    expect(remainingNoteChars(MAX_NOTE_MARKDOWN_CHARS)).toBe(0);
    expect(remainingNoteChars(MAX_NOTE_MARKDOWN_CHARS + 1_000)).toBe(0);
  });

  it("would have caught the caps disagreeing", () => {
    // The bug: a flat 2 MB image cap against a note capped in characters. A 2 MB
    // paste was accepted and cost about five notes' worth of budget, so the
    // paste succeeded and every save afterwards failed.
    expect(dataUrlChars(2 * 1024 * 1024, "image/png")).toBeGreaterThan(
      MAX_NOTE_MARKDOWN_CHARS * 4,
    );
  });

  it("keeps the in-memory bound above what a note can hold, since the note decides", () => {
    // MAX_INLINE_IMAGE_BYTES is only there to stop a huge file being encoded at
    // all; the note's remaining room is the real limit, so this must not be the
    // thing that silently decides.
    expect(dataUrlChars(MAX_INLINE_IMAGE_BYTES, "image/png")).toBeGreaterThan(
      MAX_NOTE_MARKDOWN_CHARS,
    );
  });
});
