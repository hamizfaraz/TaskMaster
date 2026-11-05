/**
 * Retry transient HTTP failures on the Neon driver.
 *
 * `DB_DRIVER=neon-http` makes every query an HTTP round trip, and a Neon compute
 * auto-suspends when idle. A request arriving while it wakes can fail outright,
 * which surfaced as `Failed query: select ... from "session"` — better-auth's
 * session lookup, which runs first on essentially every request and so is the
 * one that eats the cold start. Nothing was wrong with sessions; they were just
 * first in the queue.
 *
 * ## Only reads are retried
 *
 * A failed request is ambiguous: the statement may have run and only the
 * response been lost. Retrying an INSERT in that state writes it twice. Rather
 * than guess, this retries only when every statement in the request is a read,
 * which makes a duplicate write impossible by construction instead of unlikely.
 * A write that hits a cold start still fails, and still fails honestly.
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [150, 400];

/** A statement has to begin as a read to be one. */
const READ_START_RE = /^\s*(?:with|select|show|explain)\b/i;

/**
 * Any word that can change data, wherever it appears.
 *
 * Checking only how a statement *starts* is not enough: a data-modifying CTE
 * begins with `with` and still writes —
 * `with moved as (delete from note returning *) insert into archive ...`
 * would otherwise look like a read and be retried, which is the one outcome this
 * module exists to prevent. Matching the word anywhere also rejects a genuine
 * read that merely mentions "delete" in a string literal; that is a false
 * negative, and a missed retry is the safe direction to be wrong in.
 */
const WRITE_WORD_RE =
  /\b(?:insert|update|delete|merge|upsert|create|drop|alter|truncate|grant|revoke|copy|vacuum|analyze|reindex|call|do|set|lock|nextval)\b/i;

function isReadOnlyStatement(statement: string): boolean {
  return READ_START_RE.test(statement) && !WRITE_WORD_RE.test(statement);
}

function statementsOf(body: unknown): string[] | null {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body) as { query?: unknown; queries?: unknown };
    if (typeof parsed.query === "string") return [parsed.query];
    if (Array.isArray(parsed.queries)) {
      const all = parsed.queries.map((q) => (q as { query?: unknown }).query);
      if (all.every((q): q is string => typeof q === "string")) return all;
    }
    return null;
  } catch {
    return null;
  }
}

/** True only when every statement in the request is a read. */
export function isRetryableRequest(body: unknown): boolean {
  const statements = statementsOf(body);
  // Unparseable body: assume it could write, and do not retry.
  if (!statements || statements.length === 0) return false;
  return statements.every(isReadOnlyStatement);
}

/**
 * A 5xx is the proxy or the compute failing, which clears. A 4xx is the
 * statement itself being wrong, and will fail identically forever.
 */
export function isRetryableResponse(status: number): boolean {
  return status >= 500;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A `fetch` that retries a transient failure on a read.
 *
 * Backoff is deliberately short: this sits in the request path, so the choice is
 * between a brief stall and a hard error, not between a stall and a slow success.
 */
export function createRetryingFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async function retryingFetch(input, init) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const retryable = isRetryableRequest(init?.body);
      try {
        const response = await baseFetch(input, init);
        if (!isRetryableResponse(response.status) || !retryable || attempt === MAX_ATTEMPTS) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      }
      await wait(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!);
    }

    // Unreachable: the loop returns or throws on its final attempt.
    throw lastError ?? new Error("Database request failed after retries.");
  };
}
