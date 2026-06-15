// Spaced-repetition scheduling. Reviews advance up an expanding interval
// ladder so recall is tested right before forgetting. The schedule is anchored
// to when a note is enrolled (not the note's original creation date), and only
// the single next review is ever materialized.

export const REVIEW_LADDER_DAYS = [1, 3, 7, 14, 30, 60] as const;

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

const LAST_STAGE = REVIEW_LADDER_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isReviewRating(value: unknown): value is ReviewRating {
  return (
    typeof value === "string" &&
    (REVIEW_RATINGS as readonly string[]).includes(value)
  );
}

function clampStage(stage: number) {
  if (!Number.isFinite(stage)) return 0;
  return Math.min(Math.max(Math.trunc(stage), 0), LAST_STAGE);
}

/**
 * Decide the next ladder stage from the current stage and the user's rating:
 *   again → reset to 0, hard → repeat, good → +1, easy → +2 (all clamped).
 */
export function nextStage(stage: number, rating: ReviewRating): number {
  const current = clampStage(stage);
  switch (rating) {
    case "again":
      return 0;
    case "hard":
      return current;
    case "good":
      return clampStage(current + 1);
    case "easy":
      return clampStage(current + 2);
    default:
      return current;
  }
}

/**
 * The next review date for a given stage, measured from `fromDate`, normalized
 * to 12:00 UTC of the target day. The noon-UTC normalization keeps the date on
 * the intended calendar day regardless of the viewer's timezone (the calendar
 * keys events by their UTC date — see getEventDateKey in calendar-client.tsx).
 */
export function nextReviewDate(fromDate: Date, stage: number): Date {
  const days = REVIEW_LADDER_DAYS[clampStage(stage)];
  const target = new Date(fromDate.getTime() + days * DAY_MS);
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
}

/** Initial schedule applied when a note is first enrolled. */
export function initialSchedule(now: Date = new Date()) {
  return { stage: 0, nextReviewAt: nextReviewDate(now, 0) };
}

/** Schedule update applied after a completed review session. */
export function applyReview(
  currentStage: number,
  rating: ReviewRating,
  now: Date = new Date(),
) {
  const stage = nextStage(currentStage, rating);
  return { stage, nextReviewAt: nextReviewDate(now, stage) };
}
