import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { toast } from "sonner";
import { useAutosave } from "@/components/note-editor/use-autosave";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("debounces and saves the latest content under the note id it was typed into", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ noteId: "note-1", onSave, delay: 180 }));

    act(() => {
      result.current.notifyChange("a");
      result.current.notifyChange("ab");
      result.current.notifyChange("abc");
    });
    expect(result.current.status).toBe("dirty");
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(181);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("note-1", "abc");
    expect(result.current.status).toBe("saved");
  });

  it("coalesces edits made during an in-flight save into one trailing save", async () => {
    const first = deferred();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ noteId: "note-1", onSave, delay: 10 }));

    act(() => result.current.notifyChange("v1"));
    await act(async () => {
      vi.advanceTimersByTime(11);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    // Two more edits while v1 is still saving.
    act(() => {
      result.current.notifyChange("v2");
      result.current.notifyChange("v3");
    });
    await act(async () => {
      vi.advanceTimersByTime(11);
    });
    expect(onSave).toHaveBeenCalledTimes(1); // still blocked behind v1

    await act(async () => {
      first.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("note-1", "v3");
    expect(result.current.status).toBe("saved");
  });

  it("re-queues content and surfaces the error when a save fails, then retries", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ noteId: "note-1", onSave, delay: 10 }));

    act(() => result.current.notifyChange("keep me"));
    await act(async () => {
      vi.advanceTimersByTime(11);
    });

    expect(result.current.status).toBe("error");
    expect(toast.error).toHaveBeenCalledWith(
      "Could not save note",
      expect.objectContaining({ description: "offline" }),
    );

    await act(async () => {
      await result.current.retry();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("note-1", "keep me");
    expect(result.current.status).toBe("saved");
  });

  it("holds edits while disabled and saves them under the new id once enabled", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ noteId, enabled }) => useAutosave({ noteId, onSave, enabled, delay: 10 }),
      { initialProps: { noteId: "temp-1", enabled: false } },
    );

    act(() => result.current.notifyChange("typed early"));
    await act(async () => {
      vi.advanceTimersByTime(11);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ noteId: "real-1", enabled: true });
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("real-1", "typed early");
  });
});
