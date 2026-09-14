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
 * Debounced, coalescing autosave with a per-note queue.
 *
 * Content coalesces *within* a note (the newest text wins) but never across
 * notes: typing in A, switching to B, then to C before A's save has started
 * must still save all three. A single-slot mailbox got this wrong — the
 * pending entry for B was overwritten the moment C was typed into, and B's
 * edits were lost. Queued notes save in the order they were first queued,
 * with at most one request in flight.
 *
 * A failed save re-queues its content (unless newer content already
 * superseded it) and surfaces the error instead of dropping the edit.
 *
 * `latest` is the newest markdown this session has produced per note. The
 * editor prefers it over the workspace's copy of the server state when
 * switching back to a note, since that copy may predate a save still in
 * flight. `draft` is the most recent entry, kept for callers that need to
 * know which note was typed into last.
 */
export function useAutosave({ noteId, onSave, enabled = true, delay = 180 }: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [draft, setDraft] = useState<AutosaveDraft | null>(null);
  const [latest, setLatest] = useState<Record<string, string>>({});
  const queueRef = useRef(new Map<string, string>());
  const flushingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const enabledRef = useRef(enabled);
  const noteIdRef = useRef(noteId);
  const previousRef = useRef({ noteId, enabled });
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
      while (queueRef.current.size > 0) {
        const [id, markdown] = queueRef.current.entries().next().value as [string, string];
        queueRef.current.delete(id);
        setStatus("saving");

        try {
          await onSaveRef.current(id, markdown);
          setStatus(queueRef.current.size > 0 ? "dirty" : "saved");
        } catch (error) {
          if (!queueRef.current.has(id)) {
            queueRef.current.set(id, markdown);
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
      const id = noteIdRef.current;
      queueRef.current.set(id, markdown); // Map keeps first-queued order; newest text per note
      setDraft({ noteId: id, markdown });
      setLatest((current) => ({ ...current, [id]: markdown }));
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

  // A temp note promoted to its real id (saving just became possible):
  // retarget what was typed under the temp id, then persist it. Plain note
  // switches leave `enabled` true and only drain the queue.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { noteId, enabled };

    if (enabled && !previous.enabled && previous.noteId !== noteId) {
      const queued = queueRef.current.get(previous.noteId);
      if (queued !== undefined) {
        queueRef.current.delete(previous.noteId);
        queueRef.current.set(noteId, queued);
      }
      setLatest((current) =>
        current[previous.noteId] === undefined
          ? current
          : { ...current, [noteId]: current[previous.noteId] },
      );
    }

    if (enabled && queueRef.current.size > 0) {
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

  return { status, draft, latest, notifyChange, flush, retry: flush };
}
