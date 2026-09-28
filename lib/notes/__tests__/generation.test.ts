import { describe, expect, it } from "vitest";
import {
  extractDocumentText,
  OCR_SUPPORTED_MIME_TYPES,
  rebalanceGeneratedTopics,
} from "@/lib/notes/generation";
import { MAX_INLINE_DOCUMENT_BYTES } from "@/lib/notes/limits";

describe("rebalanceGeneratedTopics", () => {
  it("merges many small generated topics into fewer dense notes", () => {
    const topics = Array.from({ length: 8 }, (_, index) => ({
      title: `Slide ${index + 1}`,
      markdown: `Important detail ${index + 1}. `.repeat(20).trim(),
    }));

    const rebalanced = rebalanceGeneratedTopics(topics);

    expect(rebalanced).toHaveLength(1);
    expect(rebalanced[0]?.title).toBe("Slide 1 + Slide 8");
    expect(rebalanced[0]?.markdown).toContain("## Slide 1");
    expect(rebalanced[0]?.markdown).toContain("## Slide 8");
  });

  it("caps larger documents at four generated notes", () => {
    const topics = Array.from({ length: 12 }, (_, index) => ({
      title: `Topic ${index + 1}`,
      markdown: `Detailed content ${index + 1}. `.repeat(250).trim(),
    }));

    const rebalanced = rebalanceGeneratedTopics(topics);

    expect(rebalanced).toHaveLength(4);
    expect(rebalanced.every((topic) => topic.markdown.length > 1000)).toBe(true);
  });
});

describe("extractDocumentText", () => {
  // These guards run before the Gemini client is constructed, so they are the
  // part of the OCR step that can be tested without a key or a network call.
  const tiny = Buffer.from("not really a document");

  it("refuses GIF, which Azure accepted and Gemini does not", async () => {
    // The one behaviour lost in the migration. Asserted so it cannot be
    // quietly re-added to the upload allowlist without this failing.
    expect(OCR_SUPPORTED_MIME_TYPES.has("image/gif")).toBe(false);
    await expect(extractDocumentText(tiny, "image/gif", "notes.gif")).rejects.toThrow(
      /cannot read image\/gif/,
    );
  });

  it("refuses a type Gemini cannot read at all", async () => {
    await expect(
      extractDocumentText(tiny, "application/vnd.ms-powerpoint", "deck.ppt"),
    ).rejects.toThrow(/cannot read/);
  });

  it("accepts the formats Gemini documents, including phone-camera HEIC", () => {
    expect([...OCR_SUPPORTED_MIME_TYPES].toSorted()).toEqual([
      "application/pdf",
      "image/heic",
      "image/heif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("refuses a file too large to inline, rather than letting Gemini reject it", async () => {
    // Base64 inflates by 4/3 against a 20 MB request limit, so the ceiling is
    // below the raw file size and a clear local error beats an opaque 400.
    const oversized = Buffer.alloc(MAX_INLINE_DOCUMENT_BYTES + 1);
    await expect(extractDocumentText(oversized, "application/pdf", "big.pdf")).rejects.toThrow(
      /too large/,
    );
  });
});
