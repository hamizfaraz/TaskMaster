/**
 * Tell "the provider is rate-limiting us" apart from "this input is bad".
 *
 * Both used to surface as the same message. An upload that hit Gemini's daily
 * free-tier cap reported "Could not generate notes from that file", which
 * blames the file: the user retries with a different one, and that fails too,
 * because nothing was ever wrong with the file.
 */

/** Shown to the user when the model provider is refusing on quota. */
export const RATE_LIMITED_MESSAGE =
  "The AI service is rate limited right now. Wait a minute and try again — nothing is wrong with your file.";

/** Shown when the daily allowance is gone rather than a per-minute burst. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "The AI service's daily quota has run out. This resets tomorrow, or on a paid plan.";

function textOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    // AI SDK wraps the provider error; its message carries the response body.
    const nested = (error as { cause?: unknown }).cause;
    return `${error.message} ${nested ? textOf(nested) : ""}`;
  }
  if (typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  }
  return "";
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object") {
    const candidate = error as { statusCode?: unknown; status?: unknown; cause?: unknown };
    for (const value of [candidate.statusCode, candidate.status]) {
      if (typeof value === "number") return value;
    }
    if (candidate.cause) return statusOf(candidate.cause);
  }
  return null;
}

/** Is this the provider refusing on rate or quota, rather than a bad request? */
export function isRateLimited(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  const text = textOf(error).toLowerCase();
  return (
    text.includes("429") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit") ||
    text.includes("exceeded your current quota")
  );
}

/** True when the limit is the daily allowance rather than a short burst. */
export function isQuotaExhausted(error: unknown): boolean {
  if (!isRateLimited(error)) return false;
  const text = textOf(error).toLowerCase();
  // Per-minute limits name a short retry; daily ones do not.
  const retrySeconds = text.match(/retry in ([0-9.]+)s/)?.[1];
  if (retrySeconds && Number(retrySeconds) < 120) return false;
  return text.includes("per day") || text.includes("daily") || !retrySeconds;
}

/** The message to show the user for a provider failure, or null if it is not one. */
export function rateLimitMessage(error: unknown): string | null {
  if (!isRateLimited(error)) return null;
  return isQuotaExhausted(error) ? QUOTA_EXHAUSTED_MESSAGE : RATE_LIMITED_MESSAGE;
}
