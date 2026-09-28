import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withProviderRetry } from "@/lib/notes/generation";

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
