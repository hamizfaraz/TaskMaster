import type { ReviewRating } from "./scheduling";

/** Raw row shape returned from the entry query / API (dates may be Date or ISO). */
export type SpacedRepEntryRecord = {
  id: string;
  noteId: string;
  noteTitle: string;
  markdown: string;
  stage: number;
  nextReviewAt: string | Date;
  lastReviewedAt: string | Date | null;
  reviewCount: number;
  totalStudySeconds: number;
  lastRating: string | null;
  hasEmbedding: boolean;
};

/** Client-side shape used by the spaced-repetition workspace. */
export type SpacedRepEntry = {
  id: string;
  noteId: string;
  noteTitle: string;
  markdown: string;
  stage: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  totalStudySeconds: number;
  lastRating: ReviewRating | null;
  hasEmbedding: boolean;
};

function normalizeDate(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function rowToEntry(record: SpacedRepEntryRecord): SpacedRepEntry {
  return {
    id: record.id,
    noteId: record.noteId,
    noteTitle: record.noteTitle,
    markdown: record.markdown ?? "",
    stage: record.stage,
    nextReviewAt: normalizeDate(record.nextReviewAt),
    lastReviewedAt: record.lastReviewedAt
      ? normalizeDate(record.lastReviewedAt)
      : null,
    reviewCount: record.reviewCount,
    totalStudySeconds: record.totalStudySeconds,
    lastRating: (record.lastRating as ReviewRating | null) ?? null,
    hasEmbedding: record.hasEmbedding,
  };
}

/** Sort due/overdue entries first (earliest next review at the top). */
export function sortEntries(entries: SpacedRepEntry[]) {
  return [...entries].sort(
    (left, right) =>
      new Date(left.nextReviewAt).getTime() -
      new Date(right.nextReviewAt).getTime(),
  );
}

/** Whether an entry's next review is due (now or in the past). */
export function isEntryDue(entry: SpacedRepEntry, now: Date = new Date()) {
  return new Date(entry.nextReviewAt).getTime() <= now.getTime();
}
