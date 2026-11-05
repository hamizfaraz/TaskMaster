import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withProviderRetry } from "@/lib/notes/generation";
import { hasTimeFor, remainingMs, withDeadline } from "@/lib/notes/deadline";

function providerError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

const busy = () =>
  providerError(503, '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');

const dailyQuota = () =>
  providerError(
    429,
    '{"error":{"code":429,"message":"You exceeded your current quota.\\n* Quota exceeded for metric: generate_content_free_tier_requests, limit: 20\\nPlease retry in 37s.","status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}',
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Run `promise` to completion, letting every scheduled backoff elapse. */
async function settle<T>(promise: Promise<T>) {
  const result = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  return result;
}

describe("withProviderRetry", () => {
  it("does not retry a call that succeeds", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    await expect(withProviderRetry("step", run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries a busy provider and returns the later success", async () => {
    // The failure this was built for: three sequential calls hit a 503 twice in
    // ten minutes, and without a retry the step just failed.
    const run = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    const outcome = await settle(withProviderRetry("step", run));
    expect(outcome).toEqual({ ok: true, value: "ok" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after a bounded number of attempts", async () => {
    const run = vi.fn().mockRejectedValue(busy());
    const outcome = await settle(withProviderRetry("step", run));
    expect(outcome.ok).toBe(false);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry an exhausted daily quota", async () => {
    // Waiting cannot help, so retrying only delays telling the user.
    const run = vi.fn().mockRejectedValue(dailyQuota());
    const outcome = await settle(withProviderRetry("step", run));
    expect(outcome.ok).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failure that is the caller's fault", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Unsupported file type"));
    const outcome = await settle(withProviderRetry("step", run));
    expect(outcome.ok).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original error once it gives up", async () => {
    const run = vi.fn().mockRejectedValue(busy());
    const outcome = await settle(withProviderRetry("step", run));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as { status?: number }).status).toBe(503);
  });

  it("waits between attempts rather than hammering the provider", async () => {
    const run = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    const promise = withProviderRetry("step", run);
    const settled = promise.then(() => "done");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1); // still waiting out the backoff
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(settled).resolves.toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("the run deadline", () => {
  it("reports no deadline when none is in force", () => {
    // Steps are also called on their own — embedNote uses embedGeneratedTopics
    // directly — and must keep working with no budget set.
    expect(remainingMs()).toBeNull();
    expect(hasTimeFor(600_000, 600_000)).toBe(true);
  });

  it("keeps the outer deadline when nested", async () => {
    vi.useRealTimers();
    await withDeadline(100_000, async () => {
      const outer = remainingMs()!;
      await withDeadline(5_000, async () => {
        // A nested call must not shorten or extend the run it belongs to.
        expect(remainingMs()!).toBeGreaterThan(outer - 1_000);
      });
    });
    vi.useFakeTimers();
  });

  it("retries inside the budget", async () => {
    const run = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    const outcome = await settle(withDeadline(200_000, () => withProviderRetry("step", run)));
    expect(outcome).toEqual({ ok: true, value: "ok" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not wait when the budget cannot cover the retry", async () => {
    // This is the fix: four steps each waiting up to a minute twice could
    // outlast the route's maxDuration, and the platform would kill the handler —
    // turning an error the caller can read into nothing at all.
    const run = vi.fn().mockRejectedValue(busy());
    const outcome = await settle(withDeadline(1_000, () => withProviderRetry("step", run)));
    expect(outcome.ok).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("surfaces the provider's error, not a deadline error", async () => {
    // The caller needs to know it was a busy provider so it can say so.
    const run = vi.fn().mockRejectedValue(busy());
    const outcome = await settle(withDeadline(1_000, () => withProviderRetry("step", run)));
    if (!outcome.ok) expect((outcome.error as { status?: number }).status).toBe(503);
  });
});
