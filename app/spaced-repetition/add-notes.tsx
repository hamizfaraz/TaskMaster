"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";
import { getRenderableTitle } from "@/lib/notes/labels";
import type { AvailableNote } from "./spaced-repetition-types";

export function AddNotes({
  notes,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  notes: AvailableNote[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (noteIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
          leadingIcon={<ArrowLeft className="size-4" />}
        >
          Schedule
        </Button>
        <Badge variant="outline">{selectedIds.length} selected</Badge>
      </div>

      {notes.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface/70 p-8">
          <div className="max-w-sm space-y-2 text-center">
            <p className="text-sm font-medium text-foreground">
              No notes available to add
            </p>
            <p className="text-sm text-muted-foreground">
              Every note you have is already in your review schedule. Create more
              notes to enroll them here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {notes.map((note) => {
            const selected = selectedIds.includes(note.id);
            return (
              <label
                key={note.id}
                className={cx(
                  "flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-sm transition hover:border-border-strong hover:bg-surface-muted",
                  selected ? "border-accent bg-accent-soft/60" : "border-border",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--accent)]"
                  checked={selected}
                  disabled={isSubmitting}
                  onChange={() => toggle(note.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {getRenderableTitle(note.title)}
                  </span>
                  {note.hasEmbedding ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="size-3" aria-hidden="true" />
                      Quiz-ready
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="flex shrink-0 justify-end">
        <Button
          type="button"
          onClick={() => onConfirm(selectedIds)}
          disabled={isSubmitting || selectedIds.length === 0}
          leadingIcon={
            isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )
          }
        >
          {isSubmitting
            ? "Adding..."
            : selectedIds.length > 0
              ? `Add ${selectedIds.length} note${selectedIds.length === 1 ? "" : "s"}`
              : "Add notes"}
        </Button>
      </div>
    </section>
  );
}
