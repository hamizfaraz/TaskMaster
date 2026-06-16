"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  rowToEntry,
  sortEntries,
  type SpacedRepEntry,
  type SpacedRepEntryRecord,
} from "@/lib/spaced-repetition/records";
import type { ReviewRating } from "@/lib/spaced-repetition/scheduling";
import { dueLabel } from "./format";
import { ReviewQueue } from "./review-queue";
import { AddNotes } from "./add-notes";
import { StudySession } from "./study-session";
import type {
  AvailableNote,
  SpacedRepetitionView,
} from "./spaced-repetition-types";

type SpacedRepetitionWorkspaceProps = {
  initialEntries: SpacedRepEntry[];
  notes: AvailableNote[];
  storageReady: boolean;
};

async function readEntries(response: Response): Promise<SpacedRepEntry[]> {
  const payload = (await response.json().catch(() => null)) as
    | SpacedRepEntryRecord
    | SpacedRepEntryRecord[]
    | { error?: string }
    | null;
  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error
        ? payload.error
        : "The request failed.";
    throw new Error(message);
  }
  const records = Array.isArray(payload)
    ? payload
    : ([payload] as SpacedRepEntryRecord[]);
  return records.map(rowToEntry);
}

export function SpacedRepetitionWorkspace({
  initialEntries,
  notes,
  storageReady,
}: SpacedRepetitionWorkspaceProps) {
  const [entries, setEntries] = useState(() => sortEntries(initialEntries));
  const [view, setView] = useState<SpacedRepetitionView>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const enrolledNoteIds = useMemo(
    () => new Set(entries.map((entry) => entry.noteId)),
    [entries],
  );
  const availableNotes = useMemo(
    () => notes.filter((note) => !enrolledNoteIds.has(note.id)),
    [notes, enrolledNoteIds],
  );
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  function mergeEntries(next: SpacedRepEntry[]) {
    setEntries((current) => {
      const byId = new Map(current.map((entry) => [entry.id, entry]));
      for (const entry of next) byId.set(entry.id, entry);
      return sortEntries(Array.from(byId.values()));
    });
  }

  async function handleEnroll(noteIds: string[]) {
    if (noteIds.length === 0) return;
    if (!storageReady) {
      toast.error("Spaced repetition storage is not ready", {
        description: "Run the latest database migration before enrolling.",
        duration: 5000,
      });
      return;
    }

    setIsSubmitting(true);
    const id = toast.loading("Adding notes...", { duration: Infinity });
    try {
      const response = await fetch("/api/spaced-repetition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds }),
      });
      const created = await readEntries(response);
      mergeEntries(created);
      toast.success(
        `Added ${created.length} note${created.length === 1 ? "" : "s"}`,
        { id },
      );
      setView("queue");
    } catch (err) {
      toast.error("Could not add notes", {
        id,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(entry: SpacedRepEntry) {
    const previous = entries;
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    if (selectedId === entry.id) {
      setSelectedId(null);
      setView("queue");
    }

    try {
      const response = await fetch(`/api/spaced-repetition/${entry.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Could not remove the note.");
      }
      toast.success("Removed from spaced repetition");
    } catch (err) {
      setEntries(sortEntries(previous));
      toast.error("Could not remove note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleReview(rating: ReviewRating, studySeconds: number) {
    if (!selectedEntry) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/spaced-repetition/${selectedEntry.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, studySeconds }),
        },
      );
      const [updated] = await readEntries(response);
      mergeEntries([updated]);
      toast.success("Session saved", {
        description: `Next review ${dueLabel(updated.nextReviewAt).label.toLowerCase()}.`,
      });
      setSelectedId(null);
      setView("queue");
    } catch (err) {
      toast.error("Could not save session", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view === "add" ? (
        <AddNotes
          notes={availableNotes}
          isSubmitting={isSubmitting}
          onCancel={() => setView("queue")}
          onConfirm={handleEnroll}
        />
      ) : view === "study" && selectedEntry ? (
        <StudySession
          key={selectedEntry.id}
          entry={selectedEntry}
          isSubmitting={isSubmitting}
          onBack={() => {
            setSelectedId(null);
            setView("queue");
          }}
          onSubmit={handleReview}
        />
      ) : (
        <ReviewQueue
          entries={entries}
          storageReady={storageReady}
          disabled={isSubmitting}
          onAdd={() => setView("add")}
          onSelect={(entry) => {
            setSelectedId(entry.id);
            setView("study");
          }}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
}
