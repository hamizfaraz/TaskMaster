"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";
import { getRenderableTitle } from "@/lib/notes/labels";
import type { SpacedRepEntry } from "@/lib/spaced-repetition/records";
import {
  REVIEW_LADDER_DAYS,
  nextStage,
  type ReviewRating,
} from "@/lib/spaced-repetition/scheduling";
import { MarkdownText } from "./markdown-text";
import {
  RATING_OPTIONS,
  formatClock,
  formatDuration,
  formatReviewDate,
} from "./format";

function Tracker({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-3 py-2">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function StudySession({
  entry,
  isSubmitting,
  onBack,
  onSubmit,
}: {
  entry: SpacedRepEntry;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: (rating: ReviewRating, studySeconds: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  function handleRate(rating: ReviewRating) {
    onSubmit(rating, elapsed);
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={isSubmitting}
          leadingIcon={<ArrowLeft className="size-4" />}
        >
          Schedule
        </Button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium tabular-nums text-foreground">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          {formatClock(elapsed)}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Read-only note content */}
        <article className="min-h-0 overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-surface p-5 md:p-7">
          <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">
            {getRenderableTitle(entry.noteTitle)}
          </h1>
          {entry.markdown.trim() ? (
            <MarkdownText markdown={entry.markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              This note has no written content yet.
            </p>
          )}
        </article>

        {/* Trackers + actions */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <dl className="grid gap-2">
            <Tracker
              label="Next review (current)"
              value={formatReviewDate(entry.nextReviewAt)}
            />
            <Tracker
              label="Last reviewed"
              value={
                entry.lastReviewedAt
                  ? formatReviewDate(entry.lastReviewedAt)
                  : "Never"
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Tracker label="Reviews" value={String(entry.reviewCount)} />
              <Tracker
                label="Total time"
                value={formatDuration(entry.totalStudySeconds + elapsed)}
              />
            </div>
          </dl>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              How well did you recall it?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {RATING_OPTIONS.map((option) => {
                const days =
                  REVIEW_LADDER_DAYS[nextStage(entry.stage, option.rating)];
                return (
                  <button
                    key={option.rating}
                    type="button"
                    onClick={() => handleRate(option.rating)}
                    disabled={isSubmitting}
                    title={option.hint}
                    className={cx(
                      "flex flex-col items-center gap-0.5 rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60",
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {option.label}
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      +{days}d
                    </span>
                  </button>
                );
              })}
            </div>
            {isSubmitting ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Saving session...
              </p>
            ) : null}
          </div>

          <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-3 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              Test your recall
            </p>
            {entry.hasEmbedding ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Turn this note into a quiz to actively check what stuck.
                </p>
                <Link
                  href="/quizzes"
                  className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-surface-muted"
                >
                  Open quizzes
                </Link>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                This note needs an embedding before it can be quizzed. Open it in
                Notes to generate one.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
