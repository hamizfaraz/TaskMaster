import { describe, expect, it } from "vitest";
import {
  isQuotaExhausted,
  isRateLimited,
  isRetryableProviderError,
  isServiceOverloaded,
  retryDelayMs,
  SERVICE_BUSY_MESSAGE,
  QUOTA_EXHAUSTED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  providerErrorMessage,
} from "@/lib/provider-errors";

const geminiQuota = new Error(
  'ApiError: {"error":{"code":429,"message":"You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash-lite","status":"RESOURCE_EXHAUSTED"}}',
);

const perMinute = new Error(
  "You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 10. Please retry in 23.5s",
);

// Copied verbatim from a live 429 while migrating OCR to Gemini. The daily
// allowance was spent, yet the body still asks for a 37-second retry — the
// combination that made the retry delay alone an unsafe signal.
const dailyCapWithShortRetry = new Error(
  'ApiError: {"error":{"code":429,"message":"You exceeded your current quota.\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash-lite\\nPlease retry in 37.861441309s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]}]}}',
);

describe("isRateLimited", () => {
  it("recognises the Gemini 429 body", () => {
    expect(isRateLimited(geminiQuota)).toBe(true);
  });

  it("recognises a numeric status on the error or its cause", () => {
    expect(isRateLimited({ statusCode: 429 })).toBe(true);
    expect(isRateLimited(Object.assign(new Error("wrapped"), { cause: { status: 429 } }))).toBe(true);
  });

  it("does not fire on ordinary failures", () => {
    // The case that matters: a genuinely bad file must still say so.
    expect(isRateLimited(new Error("Azure rejected the file (415)."))).toBe(false);
    expect(isRateLimited(new Error("Gemini returned an empty response."))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});

describe("isQuotaExhausted", () => {
  it("treats a daily cap as exhausted", () => {
    expect(isQuotaExhausted(geminiQuota)).toBe(true);
  });

  it("treats a short retry window as a burst, not exhaustion", () => {
    expect(isRateLimited(perMinute)).toBe(true);
    expect(isQuotaExhausted(perMinute)).toBe(false);
  });

  it("believes the named quota over a short retry delay", () => {
    // The named quota is per-day, so this is exhaustion even though the body
    // asks for a 37s retry. Reading the delay first reported "wait a minute"
    // for a limit that only resets tomorrow.
    expect(isQuotaExhausted(dailyCapWithShortRetry)).toBe(true);
    expect(providerErrorMessage(dailyCapWithShortRetry)).toBe(QUOTA_EXHAUSTED_MESSAGE);
  });
});

describe("providerErrorMessage", () => {
  it("returns null for errors that are the caller's fault", () => {
    expect(providerErrorMessage(new Error("Unsupported file type"))).toBeNull();
  });

  it("distinguishes waiting a minute from waiting a day", () => {
    expect(providerErrorMessage(perMinute)).toBe(RATE_LIMITED_MESSAGE);
    expect(providerErrorMessage(geminiQuota)).toBe(QUOTA_EXHAUSTED_MESSAGE);
  });
});

// The exact body the pipeline hit twice in ten minutes while being audited.
const overloaded = Object.assign(
  new Error(
    '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
  ),
  { status: 503 },
);

describe("isServiceOverloaded", () => {
  it("recognises a 503 from the provider", () => {
    expect(isServiceOverloaded(overloaded)).toBe(true);
  });

  it("is not confused with a rate limit", () => {
    // 503 is the provider being busy; 429 is us asking for too much. They need
    // different messages, so they must not collapse into one another.
    expect(isRateLimited(overloaded)).toBe(false);
    expect(isServiceOverloaded(geminiQuota)).toBe(false);
    expect(isServiceOverloaded(perMinute)).toBe(false);
  });

  it("does not fire on an ordinary failure", () => {
    expect(isServiceOverloaded(new Error("Unsupported file type"))).toBe(false);
  });

  it("does not treat the bare word 'unavailable' as a busy provider", () => {
    // "model unavailable" and "unavailable in your region" are permanent. Reading
    // the English word rather than the protocol status made a plain failure look
    // transient, so it would be retried and then reported as "try again".
    expect(isServiceOverloaded(new Error("model unavailable"))).toBe(false);
    expect(isServiceOverloaded(new Error("This model is unavailable in your region"))).toBe(false);
    expect(isRetryableProviderError(new Error("model unavailable"))).toBe(false);
  });
});

describe("providerErrorMessage for a busy provider", () => {
  it("says the service is busy, not that the file is bad", () => {
    // This is the whole point: it used to fall through to "Could not generate
    // notes from that file", which blames the one thing that is not at fault.
    expect(providerErrorMessage(overloaded)).toBe(SERVICE_BUSY_MESSAGE);
    expect(SERVICE_BUSY_MESSAGE).toContain("nothing is wrong with your file");
  });
});

describe("isRetryableProviderError", () => {
  it("retries a busy provider", () => {
    expect(isRetryableProviderError(overloaded)).toBe(true);
  });

  it("retries a per-minute burst", () => {
    expect(isRetryableProviderError(perMinute)).toBe(true);
  });

  it("does not retry an exhausted daily quota", () => {
    // It will not clear on its own, so waiting only delays telling the user.
    expect(isRetryableProviderError(geminiQuota)).toBe(false);
    expect(isRetryableProviderError(dailyCapWithShortRetry)).toBe(false);
  });

  it("does not retry a failure that is the caller's fault", () => {
    expect(isRetryableProviderError(new Error("Unsupported file type"))).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("honours a sane delay named by the provider", () => {
    expect(retryDelayMs(perMinute, 1)).toBe(23_500);
  });

  it("backs off when no delay is named", () => {
    expect(retryDelayMs(overloaded, 1)).toBe(15_000);
    expect(retryDelayMs(overloaded, 2)).toBe(30_000);
  });

  it("caps the wait so a step cannot hang indefinitely", () => {
    expect(retryDelayMs(overloaded, 99)).toBe(60_000);
  });

  it("ignores an implausible named delay", () => {
    const silly = new Error("rate limit exceeded. Please retry in 86400s");
    expect(retryDelayMs(silly, 1)).toBe(15_000);
  });
});
