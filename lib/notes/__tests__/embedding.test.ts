import { describe, expect, it } from "vitest";
import { EMBEDDING_FRESHNESS_MS, shouldReembed } from "@/lib/notes/embedding";

const now = Date.UTC(2026, 0, 1, 12, 0, 0);
const ago = (ms: number) => new Date(now - ms);

describe("shouldReembed", () => {
  it("always embeds a note that has never been embedded", () => {
    // This is the case that made every hand-written note invisible to
    // flashcard and quiz generation: nothing embedded on create or update.
    expect(shouldReembed({ embedding: null, embeddingUpdatedAt: null }, now)).toBe(true);
    expect(shouldReembed({ embedding: [], embeddingUpdatedAt: null }, now)).toBe(true);
  });

  it("refreshes a legacy vector that predates the timestamp column", () => {
    expect(shouldReembed({ embedding: [0.1], embeddingUpdatedAt: null }, now)).toBe(true);
  });

  it("throttles while the vector is still fresh", () => {
    expect(shouldReembed({ embedding: [0.1], embeddingUpdatedAt: ago(0) }, now)).toBe(false);
    expect(
      shouldReembed({ embedding: [0.1], embeddingUpdatedAt: ago(EMBEDDING_FRESHNESS_MS - 1) }, now),
    ).toBe(false);
  });

  it("re-embeds once the window has passed", () => {
    expect(
      shouldReembed({ embedding: [0.1], embeddingUpdatedAt: ago(EMBEDDING_FRESHNESS_MS) }, now),
    ).toBe(true);
    expect(
      shouldReembed({ embedding: [0.1], embeddingUpdatedAt: ago(60 * 60 * 1000) }, now),
    ).toBe(true);
  });
});
