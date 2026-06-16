import type { ReviewRating } from "@/lib/spaced-repetition/scheduling";

const DAY_MS = 24 * 60 * 60 * 1000;

const ABSOLUTE_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export type DueTone = "overdue" | "today" | "upcoming";

export function formatReviewDate(iso: string) {
  return ABSOLUTE_DATE_FORMATTER.format(new Date(iso));
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Friendly relative label + tone for a next-review date, in the viewer's day. */
export function dueLabel(
  iso: string,
  now: Date = new Date(),
): { label: string; tone: DueTone } {
  const dayDiff = Math.round(
    (startOfLocalDay(new Date(iso)) - startOfLocalDay(now)) / DAY_MS,
  );

  if (dayDiff < 0) {
    const days = Math.abs(dayDiff);
    return {
      label: days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`,
      tone: "overdue",
    };
  }
  if (dayDiff === 0) return { label: "Due today", tone: "today" };
  if (dayDiff === 1) return { label: "Due tomorrow", tone: "upcoming" };
  return { label: `Due in ${dayDiff} days`, tone: "upcoming" };
}

/** Whether a review is due now (timestamp has passed). */
export function isDue(iso: string, now: Date = new Date()) {
  return new Date(iso).getTime() <= now.getTime();
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remaining}s`;
  }
  return `${remaining}s`;
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export const RATING_OPTIONS: ReadonlyArray<{
  rating: ReviewRating;
  label: string;
  hint: string;
}> = [
  { rating: "again", label: "Again", hint: "Forgot — reset to the start" },
  { rating: "hard", label: "Hard", hint: "Struggled — repeat this interval" },
  { rating: "good", label: "Good", hint: "Recalled — next interval" },
  { rating: "easy", label: "Easy", hint: "Effortless — skip ahead" },
];
