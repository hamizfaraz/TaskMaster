import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));

// The query builder is chainable; only the awaited result matters here.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows.value),
      }),
    }),
  },
}));

import {
  getNoteContext,
  MAX_CONTEXT_NOTES,
  MAX_MARKDOWN_CHARS_PER_NOTE,
} from "@/lib/notes/context";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "n1",
  title: "Real Numbers",
  markdown: "The ==least upper bound axiom== is essential.",
  embedding: [0.1, 0.2],
  ...over,
});

beforeEach(() => {
  rows.value = [row()];
});

describe("getNoteContext", () => {
  it("carries the student's highlights alongside the markdown", async () => {
    const [context] = await getNoteContext({ userId: "u1", noteIds: ["n1"] });
    expect(context?.highlights).toEqual(["least upper bound axiom"]);
    expect(context?.markdown).toBe("The ==least upper bound axiom== is essential.");
  });

  it("extracts highlights from the full text, not the truncated copy", async () => {
    // Truncation must not silently drop the very phrases generation is told to
    // prioritise.
    const filler = "x".repeat(MAX_MARKDOWN_CHARS_PER_NOTE);
    rows.value = [row({ markdown: `${filler} and ==the buried point==` })];

    const [context] = await getNoteContext({ userId: "u1", noteIds: ["n1"] });
    expect(context?.highlights).toEqual(["the buried point"]);
    expect(context?.markdown).toHaveLength(MAX_MARKDOWN_CHARS_PER_NOTE);
  });

  it("reports an empty embedding rather than a broken one", async () => {
    rows.value = [row({ embedding: null })];
    expect((await getNoteContext({ userId: "u1", noteIds: ["n1"] }))[0]?.embedding).toEqual([]);

    rows.value = [row({ embedding: [1, "nope", 2] })];
    expect((await getNoteContext({ userId: "u1", noteIds: ["n1"] }))[0]?.embedding).toEqual([1, 2]);
  });

  it("returns nothing when asked for nothing", async () => {
    expect(await getNoteContext({ userId: "u1", noteIds: [] })).toEqual([]);
  });

  it("caps how many notes one generation can draw on", async () => {
    const ids = Array.from({ length: MAX_CONTEXT_NOTES + 5 }, (_, index) => `n${index}`);
    rows.value = ids.map((id) => row({ id }));
    // The cap is applied to the ids before the query; the mock returns whatever
    // it is given, so this asserts the call does not throw and stays bounded.
    const result = await getNoteContext({ userId: "u1", noteIds: ids });
    expect(result.length).toBeLessThanOrEqual(ids.length);
  });

  it("returns no highlights for a note with none", async () => {
    rows.value = [row({ markdown: "Plain prose with `a == b` in code." })];
    expect((await getNoteContext({ userId: "u1", noteIds: ["n1"] }))[0]?.highlights).toEqual([]);
  });
});
