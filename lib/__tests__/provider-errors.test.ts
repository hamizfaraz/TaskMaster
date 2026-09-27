import { describe, expect, it } from "vitest";
import {
  isQuotaExhausted,
  isRateLimited,
  QUOTA_EXHAUSTED_MESSAGE,
  RATE_LIMITED_MESSAGE,
  rateLimitMessage,
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
    expect(rateLimitMessage(dailyCapWithShortRetry)).toBe(QUOTA_EXHAUSTED_MESSAGE);
  });
});

describe("rateLimitMessage", () => {
  it("returns null for errors that are the caller's fault", () => {
    expect(rateLimitMessage(new Error("Unsupported file type"))).toBeNull();
  });

  it("distinguishes waiting a minute from waiting a day", () => {
    expect(rateLimitMessage(perMinute)).toBe(RATE_LIMITED_MESSAGE);
    expect(rateLimitMessage(geminiQuota)).toBe(QUOTA_EXHAUSTED_MESSAGE);
  });
});
