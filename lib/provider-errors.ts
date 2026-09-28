/**
 * Tell "the provider is rate-limiting us" apart from "this input is bad".
 *
 * Both used to surface as the same message. An upload that hit Gemini's daily
 * free-tier cap reported "Could not generate notes from that file", which
 * blames the file: the user retries with a different one, and that fails too,
 * because nothing was ever wrong with the file.
 *
 * A 503 fell through the same crack afterwards, for the same reason: the checks
 * here only knew about 429, so "this model is currently experiencing high
 * demand" also came out as a complaint about the file. Measured while auditing
 * the pipeline — three generation calls hit it twice in ten minutes, so it is
 * not a rare state.
 */

/** Shown to the user when the model provider is refusing on quota. */
export const RATE_LIMITED_MESSAGE =
  "The AI service is rate limited right now. Wait a minute and try again — nothing is wrong with your file.";

/** Shown when the daily allowance is gone rather than a per-minute burst. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "The AI service's daily quota has run out. This resets tomorrow, or on a paid plan.";

/**
 * Shown when the provider is over capacity.
 *
 * A 503 is not our quota and not the file — it is Gemini having a busy moment,
 * and it clears on its own. Saying anything about the file sends people off
 * re-uploading, which is the failure this module exists to prevent.
 */
export const SERVICE_BUSY_MESSAGE =
  "The AI service is busy right now. Try again in a moment — nothing is wrong with your file.";

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

  // Gemini names the exhausted quota outright, so read that before guessing
  // from the retry delay. A real exhausted daily quota looks like
  //   quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier", limit 20
  // and *still* asks the caller to "retry in 37s". Trusting that delay told
  // people to wait a minute for an allowance that resets tomorrow, which is
  // the same wrong-advice failure this module exists to prevent.
  if (text.includes("perday") || text.includes("per day") || text.includes("per_day")) {
    return true;
  }
  if (text.includes("perminute") || text.includes("per minute") || text.includes("per_minute")) {
    return false;
  }

  // No named quota: a short retry means a burst limit, anything else is daily.
  const retrySeconds = text.match(/retry in ([0-9.]+)s/)?.[1];
  if (retrySeconds && Number(retrySeconds) < 120) return false;
  return text.includes("daily") || !retrySeconds;
}

/**
 * Is the provider over capacity?
 *
 * Distinct from a rate limit: 503/UNAVAILABLE means Gemini is busy, not that we
 * asked for too much. It was reaching the user as "Could not generate notes from
 * that file", which blames the one thing that is definitely not at fault.
 */
export function isServiceOverloaded(error: unknown): boolean {
  if (statusOf(error) === 503) return true;
  const text = textOf(error).toLowerCase();
  // Deliberately not the bare word "unavailable": plenty of permanent failures
  // read "model unavailable" or "unavailable in your region", and treating those
  // as transient would retry something that can never succeed and then tell the
  // user to try again. Match the protocol signal instead — the gRPC status in
  // the response body, or the provider's own overload wording.
  return (
    /"status"\s*:\s*"unavailable"/.test(text) ||
    text.includes("overloaded") ||
    text.includes("experiencing high demand")
  );
}

/**
 * Worth trying again?
 *
 * A busy provider and a per-minute burst both clear on their own. An exhausted
 * daily quota does not, so retrying it just spends the wait for nothing.
 */
export function isRetryableProviderError(error: unknown): boolean {
  if (isServiceOverloaded(error)) return true;
  return isRateLimited(error) && !isQuotaExhausted(error);
}

/**
 * How long to wait before retrying.
 *
 * The provider often names a delay; honour it when it is sane, since it knows
 * more than a fixed backoff does. Otherwise back off linearly.
 */
export function retryDelayMs(error: unknown, attempt: number): number {
  const named = textOf(error).match(/retry in ([0-9.]+)s/i)?.[1];
  const seconds = named ? Number(named) : NaN;
  if (Number.isFinite(seconds) && seconds > 0 && seconds <= 60) {
    return Math.ceil(seconds * 1000);
  }
  return Math.min(attempt * 15_000, 60_000);
}

/** The message to show the user for a provider failure, or null if it is not one. */
export function providerErrorMessage(error: unknown): string | null {
  if (isServiceOverloaded(error)) return SERVICE_BUSY_MESSAGE;
  if (!isRateLimited(error)) return null;
  return isQuotaExhausted(error) ? QUOTA_EXHAUSTED_MESSAGE : RATE_LIMITED_MESSAGE;
}
