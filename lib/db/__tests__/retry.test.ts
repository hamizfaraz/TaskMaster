import { describe, expect, it, vi } from "vitest";
import {
  createRetryingFetch,
  isRetryableRequest,
  isRetryableResponse,
} from "@/lib/db/retry";

const body = (query: string) => JSON.stringify({ query, params: [] });
const batch = (...queries: string[]) =>
  JSON.stringify({ queries: queries.map((query) => ({ query, params: [] })) });

describe("isRetryableRequest", () => {
  it("retries a select", () => {
    // The statement that actually failed: better-auth's session lookup.
    expect(isRetryableRequest(body('select "id" from "session" where "token" = $1'))).toBe(true);
  });

  it("retries a CTE that only reads, and show/explain", () => {
    expect(isRetryableRequest(body("with recent as (select 1) select * from recent"))).toBe(true);
    expect(isRetryableRequest(body("show timezone"))).toBe(true);
    expect(isRetryableRequest(body("explain select 1"))).toBe(true);
  });

  it("never retries a write", () => {
    // A failed request is ambiguous: the statement may have run and only the
    // response been lost. Retrying a write in that state would duplicate it.
    for (const sql of [
      'insert into "note" ("id") values ($1)',
      'update "note" set "title" = $1',
      'delete from "note"',
      "create table t (id text)",
      "alter table t add column c text",
      'with moved as (delete from "note" returning *) insert into "archive" select * from moved',
      'with n as (insert into "note" values ($1) returning *) select * from n',
      'with u as (update "note" set "title" = $1 returning *) select * from u',
      "select nextval('seq')",
      "set search_path to public",
    ]) {
      expect(isRetryableRequest(body(sql)), sql).toBe(false);
    }
  });

  it("retries a batch only when every statement reads", () => {
    expect(isRetryableRequest(batch("select 1", "select 2"))).toBe(true);
    expect(isRetryableRequest(batch("select 1", 'insert into "note" values ($1)'))).toBe(false);
  });

  it("refuses to retry a body it cannot read", () => {
    // Unparseable means unknown, and unknown must not be assumed safe.
    expect(isRetryableRequest("not json")).toBe(false);
    expect(isRetryableRequest(undefined)).toBe(false);
    expect(isRetryableRequest(JSON.stringify({}))).toBe(false);
    expect(isRetryableRequest(new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("isRetryableResponse", () => {
  it("retries a 5xx and not a 4xx", () => {
    // 5xx is the proxy or a waking compute; 4xx is the statement being wrong,
    // which will fail identically forever.
    expect(isRetryableResponse(503)).toBe(true);
    expect(isRetryableResponse(500)).toBe(true);
    expect(isRetryableResponse(400)).toBe(false);
    expect(isRetryableResponse(200)).toBe(false);
  });
});

describe("createRetryingFetch", () => {
  const ok = () => new Response("{}", { status: 200 });
  const unavailable = () => new Response("busy", { status: 503 });

  it("passes a successful read straight through", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select 1") });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("retries a read through a thrown network error", async () => {
    const base = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue(ok());
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select 1") });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("retries a read through a 5xx", async () => {
    const base = vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValue(ok());
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select 1") });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("does not retry a write that throws", async () => {
    const base = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const call = createRetryingFetch(base as unknown as typeof fetch)("u", {
      body: body('insert into "note" values ($1)'),
    });
    await expect(call).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry a write that 5xxs", async () => {
    const base = vi.fn().mockResolvedValue(unavailable());
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", {
      body: body('update "note" set "title" = $1'),
    });
    expect(res.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded number of attempts", async () => {
    const base = vi.fn().mockResolvedValue(unavailable());
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select 1") });
    expect(res.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("surfaces the last error when every attempt throws", async () => {
    const base = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const call = createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select 1") });
    await expect(call).rejects.toThrow("ECONNRESET");
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("does not retry a bad statement", async () => {
    const base = vi.fn().mockResolvedValue(new Response("syntax error", { status: 400 }));
    const res = await createRetryingFetch(base as unknown as typeof fetch)("u", { body: body("select bogus") });
    expect(res.status).toBe(400);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
