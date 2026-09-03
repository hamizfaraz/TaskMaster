import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, parseTestCourse, parseTestEvent, parseTestRun } from "@/lib/db/schema";
import { isClassArchived } from "./archive-marker";

export type UserClassSummary = {
  courseId: string;
  runId: string;
  title: string;
  courseCode: string | null;
  courseSection: string | null;
  term: string | null;
  instructorName: string | null;
  meetingDays: string | null;
  meetingTime: string | null;
  meetingLocation: string | null;
  updatedAt: string;
  noteCount: number;
};

export async function listUserClasses(userId: string): Promise<UserClassSummary[]> {
  const rows = await db
    .select({
      courseId: parseTestCourse.id,
      runId: parseTestRun.id,
      title: parseTestCourse.title,
      courseCode: parseTestCourse.courseCode,
      courseSection: parseTestCourse.courseSection,
      term: parseTestCourse.term,
      instructorName: parseTestCourse.instructorName,
      meetingDays: parseTestCourse.meetingDays,
      meetingTime: parseTestCourse.meetingTime,
      meetingLocation: parseTestCourse.meetingLocation,
      updatedAt: parseTestRun.updatedAt,
      warnings: parseTestRun.warnings,
    })
    .from(parseTestRun)
    .innerJoin(parseTestCourse, eq(parseTestCourse.runId, parseTestRun.id))
    .where(eq(parseTestRun.userId, userId))
    .orderBy(desc(parseTestRun.updatedAt));

  if (rows.length === 0) {
    return [];
  }

  const noteRows = await db
    .select({
      classId: note.classId,
    })
    .from(note)
    .where(eq(note.userId, userId));

  const noteCounts = new Map<string, number>();
  for (const row of noteRows) {
    if (!row.classId) {
      continue;
    }
    noteCounts.set(row.classId, (noteCounts.get(row.classId) ?? 0) + 1);
  }

  return rows
    .filter((row) => !isClassArchived(row.warnings))
    .map((row) => ({
      courseId: row.courseId,
      runId: row.runId,
      title: row.title,
      courseCode: row.courseCode,
      courseSection: row.courseSection,
      term: row.term,
      instructorName: row.instructorName,
      meetingDays: row.meetingDays,
      meetingTime: row.meetingTime,
      meetingLocation: row.meetingLocation,
      updatedAt: row.updatedAt.toISOString(),
      noteCount: noteCounts.get(row.courseId) ?? 0,
    }));
}

export async function assertClassBelongsToUser(classId: string, userId: string) {
  const [row] = await db
    .select({
      id: parseTestCourse.id,
      runId: parseTestCourse.runId,
    })
    .from(parseTestCourse)
    .innerJoin(parseTestRun, eq(parseTestRun.id, parseTestCourse.runId))
    .where(and(eq(parseTestCourse.id, classId), eq(parseTestRun.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function listUserClassEvents(userId: string) {
  return db
    .select({
      id: parseTestEvent.id,
      courseId: parseTestCourse.id,
      courseTitle: parseTestCourse.title,
      title: parseTestEvent.title,
      category: parseTestEvent.category,
      dateText: parseTestEvent.dateText,
      dueAt: parseTestEvent.dueAt,
      timeText: parseTestEvent.timeText,
      location: parseTestEvent.location,
    })
    .from(parseTestEvent)
    .innerJoin(parseTestCourse, eq(parseTestCourse.id, parseTestEvent.courseId))
    .innerJoin(parseTestRun, eq(parseTestRun.id, parseTestCourse.runId))
    .where(eq(parseTestRun.userId, userId))
    .orderBy(asc(parseTestEvent.dueAt), asc(parseTestEvent.displayOrder));
}
