"use client";

import type { ReactNode } from "react";
import { CalendarClock, Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";
import { getRenderableTitle } from "@/lib/notes/labels";
import type { SpacedRepEntry } from "@/lib/spaced-repetition/records";
import { dueLabel, formatReviewDate, isDue, type DueTone } from "./format";

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-danger",
  today: "text-accent",
  upcoming: "text-muted-foreground",
};

function StatPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-sm font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function ReviewRow({
  entry,
  onSelect,
  onRemove,
  disabled,
}: {
  entry: SpacedRepEntry;
  onSelect: (entry: SpacedRepEntry) => void;
  onRemove: (entry: SpacedRepEntry) => void;
  disabled: boolean;
}) {
  const due = dueLabel(entry.nextReviewAt);

  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-[var(--radius-lg)] border bg-surface px-4 py-3 transition",
        due.tone === "overdue"
          ? "border-red-200 dark:border-red-950/70"
          : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left focus-visible:outline-none"
      >
        <span className="truncate text-sm font-semibold text-foreground">
          {getRenderableTitle(entry.noteTitle)}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className={cx("font-medium", TONE_CLASS[due.tone])}>
            {due.label}
          </span>
          <span className="text-muted-foreground">
            {formatReviewDate(entry.nextReviewAt)}
          </span>
          <span className="text-muted-foreground">
            {entry.reviewCount} review{entry.reviewCount === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      <Button
        type="button"
        size="sm"
        variant={isDue(entry.nextReviewAt) ? "primary" : "outline"}
        onClick={() => onSelect(entry)}
        disabled={disabled}
      >
        Study
      </Button>
      <button
        type="button"
        onClick={() => onRemove(entry)}
        disabled={disabled}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-danger-soft hover:text-danger disabled:opacity-60"
        aria-label={`Remove ${getRenderableTitle(entry.noteTitle)} from spaced repetition`}
        title="Remove from spaced repetition"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ReviewQueue({
  entries,
  storageReady,
  disabled,
  onAdd,
  onSelect,
  onRemove,
}: {
  entries: SpacedRepEntry[];
  storageReady: boolean;
  disabled: boolean;
  onAdd: () => void;
  onSelect: (entry: SpacedRepEntry) => void;
  onRemove: (entry: SpacedRepEntry) => void;
}) {
  const dueCount = entries.filter((entry) => isDue(entry.nextReviewAt)).length;

  return (
    <section className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap gap-2">
          <StatPill>
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {dueCount} due now
          </StatPill>
          <StatPill>
            <Layers className="h-4 w-4" aria-hidden="true" />
            {entries.length} in rotation
          </StatPill>
        </div>
        <Button
          type="button"
          onClick={onAdd}
          disabled={!storageReady}
          leadingIcon={<Plus className="size-4" />}
        >
          Add notes
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface/70 p-8">
          <div className="max-w-sm space-y-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {storageReady
                ? "No notes in spaced repetition yet"
                : "Spaced repetition storage is not ready"}
            </p>
            <p className="text-sm text-muted-foreground">
              {storageReady
                ? "Add notes to start a long-term review schedule. Each note gets review dates on an expanding interval, shown on your calendar."
                : "Run the latest database migration to start enrolling notes."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <ReviewRow
              key={entry.id}
              entry={entry}
              onSelect={onSelect}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}
