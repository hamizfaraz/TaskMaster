import { describe, expect, it } from "vitest";
import { isPointInHorizontalEdgeGutter } from "@/components/note-editor/selection-geometry";

describe("note editor selection geometry", () => {
  const rect = {
    left: 100,
    right: 900,
    top: 50,
    bottom: 1250,
  };

  it("accepts points in the left and right editor gutters across a tall note", () => {
    expect(isPointInHorizontalEdgeGutter(rect, 120, 1100)).toBe(true);
    expect(isPointInHorizontalEdgeGutter(rect, 880, 1100)).toBe(true);
  });

  it("rejects middle content points and points outside the editor surface", () => {
    expect(isPointInHorizontalEdgeGutter(rect, 500, 1100)).toBe(false);
    expect(isPointInHorizontalEdgeGutter(rect, 120, 1300)).toBe(false);
    expect(isPointInHorizontalEdgeGutter(rect, 40, 1100)).toBe(false);
  });

  it("bounds the gutter width for narrow editor surfaces", () => {
    const narrowRect = {
      left: 0,
      right: 150,
      top: 0,
      bottom: 300,
    };

    expect(isPointInHorizontalEdgeGutter(narrowRect, 49, 20)).toBe(true);
    expect(isPointInHorizontalEdgeGutter(narrowRect, 75, 20)).toBe(false);
    expect(isPointInHorizontalEdgeGutter(narrowRect, 101, 20)).toBe(true);
  });
});
