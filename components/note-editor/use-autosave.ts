"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type AutosaveDraft = {
  noteId: string;
  markdown: string;
};

export type UseAutosaveOptions = {
  noteId: string;
  onSave: (noteId: string, markdown: string) => Promise<void>;
  /**
   * False while saving is impossible (e.g. the note only exists client-side
   * with a temporary id). Changes are still queued and flush as soon as this
   * becomes true, retargeted to the current `noteId`.
   */
  enabled?: boolean;
  /** Trailing debounce in milliseconds. */
  delay?: number;
};

/**
 * Debounced, coalescing autosave.
 *
 * One-slot mailbox + single-flight latch: at most one save is in flight and at
 * most one is queued behind it, and the queued one is always the newest
 * content. Each queued entry carries the note id it was typed into, so a
 * flush that races a note switch still saves to the right note.
 *
 * Unlike the previous editor, a failed save re-queues the content (unless
 * newer content already superseded it) and surfaces the error, instead of
 * silently discarding the edit.
 *
 * `draft` is the latest content handed to `notifyChange`, exposed as state so
 * the caller can derive what to display without keeping a second copy.
 */
export function useAutosave({ noteId, onSave, enabled = true, delay = 180 }: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [draft, setDraft] = useState<AutosaveDraft | null>(null);
  const pendingRef = useRef<AutosaveDraft | null>(null);
  const flushingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const enabledRef = useRef(enabled);
  const noteIdRef = useRef(noteId);
  onSaveRef.current = onSave;
  enabledRef.current = enabled;
  noteIdRef.current = noteId;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flushPending = useCallback(async () => {
    if (flushingRef.current || !enabledRef.current) {
      return;
    }

    flushingRef.current = true;
    try {
      while (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        setStatus("saving");

        try {
          await onSaveRef.current(next.noteId, next.markdown);
          setStatus(pendingRef.current ? "dirty" : "saved");
        } catch (error) {
          if (!pendingRef.current) {
            pendingRef.current = next;
          }
          setStatus("error");
          toast.error("Could not save note", {
            description: error instanceof Error ? error.message : undefined,
            duration: 5000,
          });
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const notifyChange = useCallback(
    (markdown: string) => {
      const next = { noteId: noteIdRef.current, markdown };
      pendingRef.current = next;
      setDraft(next);
      setStatus("dirty");
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flushPending();
      }, delay);
    },
    [delay, flushPending],
  );

  const flush = useCallback(async () => {
    clearTimer();
    await flushPending();
  }, [flushPending]);

  // Saving just became possible (temp note promoted to a real id): retarget
  // whatever was typed in the meantime and persist it.
  useEffect(() => {
    if (enabled && pendingRef.current) {
      pendingRef.current = { ...pendingRef.current, noteId };
      void flushPending();
    }
  }, [enabled, noteId, flushPending]);

  useEffect(
    () => () => {
      clearTimer();
      void flushPending();
    },
    [flushPending],
  );

  return { status, draft, notifyChange, flush, retry: flush };
}
