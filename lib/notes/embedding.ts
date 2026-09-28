import { embedGeneratedTopics } from "@/lib/notes/generation";

/**
 * How long a note's embedding is considered fresh. Autosave fires after ~180ms
 * of idle, and an embedding call costs ~300ms, so embedding on every save
 * would add that cost many times a minute for nothing. Re-embedding at most
 * this often keeps a note's vector close to its text without making typing pay
 * for it.
 */
export const EMBEDDING_FRESHNESS_MS = 30_000;

export type EmbeddingFreshness = {
  /** The note's current vector, or null when it has never been embedded. */
  embedding: number[] | null;
  /** When that vector was computed, or null for a legacy/never-embedded row. */
  embeddingUpdatedAt: Date | null;
};

/**
 * Should this note be re-embedded now?
 *
 * A note with no vector is always embedded, so notes written in the editor
 * stop being invisible to flashcard and quiz generation. A note that already
 * has one waits out the freshness window.
 */
export function shouldReembed(
  current: EmbeddingFreshness,
  now: number = Date.now(),
): boolean {
  if (!current.embedding || current.embedding.length === 0) {
    return true;
  }

  if (!current.embeddingUpdatedAt) {
    // Embedded before this column existed: refresh once, then throttle.
    return true;
  }

  return now - current.embeddingUpdatedAt.getTime() >= EMBEDDING_FRESHNESS_MS;
}

/**
 * Embed a note's text, returning null when there is nothing worth embedding or
 * the provider fails. Saving a note must never fail because embedding did.
 */
export async function embedNote(params: {
  title: string;
  markdown: string;
}): Promise<number[] | null> {
  const markdown = params.markdown.trim();
  if (markdown.length === 0) {
    return null;
  }

  try {
    const [embedded] = await embedGeneratedTopics([
      { title: params.title, markdown },
    ]);
    return embedded?.embedding ?? null;
  } catch (error) {
    console.error("[embedNote] embedding failed; the note still saves", error);
    return null;
  }
}
