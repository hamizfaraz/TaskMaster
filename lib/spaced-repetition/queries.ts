import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, spacedRepEntry } from "@/lib/db/schema";
import type { SpacedRepEntryRecord } from "./records";
import type { CalendarEvent } from "@/app/(app)/calendar/calendar-client";

/**
 * List a user's spaced-repetition entries joined to their note. Selects a
 * `hasEmbedding` boolean (computed in SQL) rather than the full vector, so the
 * embedding payload is never transferred.
 */
export async function listUserEntries(
  userId: string,
): Promise<SpacedRepEntryRecord[]> {
  return db
    .select({
      id: spacedRepEntry.id,
      noteId: spacedRepEntry.noteId,
      noteTitle: note.title,
      markdown: note.markdown,
      stage: spacedRepEntry.stage,
      nextReviewAt: spacedRepEntry.nextReviewAt,
      lastReviewedAt: spacedRepEntry.lastReviewedAt,
      reviewCount: spacedRepEntry.reviewCount,
      totalStudySeconds: spacedRepEntry.totalStudySeconds,
      lastRating: spacedRepEntry.lastRating,
      hasEmbedding: sql<boolean>`${note.embedding} is not null`,
    })
    .from(spacedRepEntry)
    .innerJoin(note, eq(note.id, spacedRepEntry.noteId))
    .where(eq(spacedRepEntry.userId, userId))
    .orderBy(asc(spacedRepEntry.nextReviewAt));
}

const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The next review for each enrolled note, mapped to the calendar's CalendarEvent
 * shape. A constant `courseId` ("spaced-rep") gives all review events one color,
 * and the "Review:" title keeps them clear of the recurring-event filter.
 */
export async function listUserReviewEvents(
  userId: string,
): Promise<CalendarEvent[]> {
  const rows = await db
    .select({
      id: spacedRepEntry.id,
      noteTitle: note.title,
      nextReviewAt: spacedRepEntry.nextReviewAt,
    })
    .from(spacedRepEntry)
    .innerJoin(note, eq(note.id, spacedRepEntry.noteId))
    .where(
      and(
        eq(spacedRepEntry.userId, userId),
        isNotNull(spacedRepEntry.nextReviewAt),
      ),
    )
    .orderBy(asc(spacedRepEntry.nextReviewAt));

  return rows.map((row) => ({
    id: `review-${row.id}`,
    courseId: "spaced-rep",
    courseTitle: "Spaced repetition",
    title: `Review: ${row.noteTitle}`,
    category: "Review",
    dateText: REVIEW_DATE_FORMATTER.format(row.nextReviewAt),
    dueAt: row.nextReviewAt.toISOString(),
    timeText: null,
    location: null,
  }));
}
