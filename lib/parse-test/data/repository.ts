import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  parseTestAssignment,
  parseTestConcept,
  parseTestContact,
  parseTestCourse,
  parseTestEvent,
  parseTestGradingItem,
  parseTestRun,
} from "@/lib/db/schema";
import type { ParseStatus, ParseTestPayload, ParseTestReviewUpdate, ParseTestViewModel } from "../contracts";
import { getParseTestModel } from "../feature";
import { isHighSignalWarning, normalisePercent, parseIsoDate } from "../normalize";

async function getRunById(userId: string, runId: string) {
  const runs = await db
    .select()
    .from(parseTestRun)
    .where(and(eq(parseTestRun.userId, userId), eq(parseTestRun.id, runId)))
    .limit(1);

  return runs[0] ?? null;
}

async function getLatestCompletedRunId(userId: string) {
  const runs = await getUserParseTestRuns(userId);
  const latestCompletedRun = runs.find((run) => run.parseStatus === "completed") ?? null;
  return latestCompletedRun?.id ?? null;
}

export async function getUserParseTestRuns(userId: string) {
  return db
    .select()
    .from(parseTestRun)
    .where(eq(parseTestRun.userId, userId))
    .orderBy(desc(parseTestRun.updatedAt));
}

export async function createProcessingRun(params: {
  runId: string;
  userId: string;
  contentHash: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  parseModel: string;
}) {
  await db.insert(parseTestRun).values({
    id: params.runId,
    userId: params.userId,
    contentHash: params.contentHash,
    originalFileName: params.fileName,
    mimeType: params.mimeType,
    fileSizeBytes: params.fileSizeBytes,
    parseStatus: "processing",
    parseModel: params.parseModel,
    warnings: [],
  });
}

export async function persistCompletedParse(params: {
  runId: string;
  geminiFileUri: string;
  payload: ParseTestPayload;
}) {
  const { runId, geminiFileUri, payload } = params;
  const courseId = randomUUID();

  await db.insert(parseTestCourse).values({
    id: courseId,
    runId,
    title: payload.courseTitle,
    courseCode: payload.courseCode,
    courseSection: payload.courseSection,
    term: payload.term,
    instructorName: payload.instructorName,
    meetingDays: payload.meetingDays,
    meetingTime: payload.meetingTime,
    meetingLocation: payload.meetingLocation,
    requiredMaterials: payload.requiredMaterials,
    homeworkTools: payload.homeworkTools,
    catalogDescription: payload.catalogDescription,
    studentSummary: payload.studentSummary,
    descriptionSource: payload.descriptionSource,
  });

  if (payload.keyConcepts.length > 0) {
    await db.insert(parseTestConcept).values(
      payload.keyConcepts.map((label, index) => ({
        id: randomUUID(),
        courseId,
        label,
        displayOrder: index,
      })),
    );
  }

  if (payload.contacts.length > 0) {
    await db.insert(parseTestContact).values(
      payload.contacts.map((contact, index) => ({
        id: randomUUID(),
        courseId,
        role: contact.role,
        name: contact.name,
        email: contact.email,
        officeHours: contact.officeHours,
        location: contact.location,
        sourceSnippet: contact.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.gradingBreakdown.length > 0) {
    await db.insert(parseTestGradingItem).values(
      payload.gradingBreakdown.map((item, index) => ({
        id: randomUUID(),
        courseId,
        label: item.label,
        weightPercent: item.weight,
        sourceSnippet: item.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.assignments.length > 0) {
    await db.insert(parseTestAssignment).values(
      payload.assignments.map((assignment, index) => ({
        id: randomUUID(),
        courseId,
        title: assignment.title,
        category: assignment.category,
        dateText: assignment.dateText,
        dueAt: parseIsoDate(assignment.isoDate),
        timeText: assignment.timeText,
        weightPercent: assignment.weight,
        sourceSnippet: assignment.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.events.length > 0) {
    await db.insert(parseTestEvent).values(
      payload.events.map((event, index) => ({
        id: randomUUID(),
        courseId,
        title: event.title,
        category: event.category,
        dateText: event.dateText,
        dueAt: parseIsoDate(event.isoDate),
        timeText: event.timeText,
        location: event.location,
        sourceSnippet: event.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  await db
    .update(parseTestRun)
    .set({
      parseStatus: "completed",
      geminiFileUri,
      warnings: payload.warnings,
      updatedAt: new Date(),
    })
    .where(eq(parseTestRun.id, runId));
}

export async function replaceCurrentRunWithFailure(runId: string, userId: string, message: string) {
  await db.delete(parseTestRun).where(eq(parseTestRun.id, runId));
  await db.insert(parseTestRun).values({
    id: runId,
    userId,
    contentHash: "",
    originalFileName: "failed-parse",
    mimeType: "application/pdf",
    fileSizeBytes: 0,
    parseStatus: "failed",
    parseModel: getParseTestModel(),
    warnings: [message],
  });
}

export async function getParseTestViewModel(userId: string): Promise<ParseTestViewModel | null> {
  const latestRunId = await getLatestCompletedRunId(userId);
  if (!latestRunId) {
    return null;
  }

  return getParseTestViewModelForRun(userId, latestRunId);
}

export async function getParseTestViewModelForRun(
  userId: string,
  runId: string,
): Promise<ParseTestViewModel | null> {
  const run = await getRunById(userId, runId);
  if (!run) {
    return null;
  }

  const courses = await db
    .select()
    .from(parseTestCourse)
    .where(eq(parseTestCourse.runId, run.id))
    .limit(1);
  const course = courses[0];

  if (!course) {
    return null;
  }

  const [concepts, contacts, gradingItems, assignments, events] = await Promise.all([
    db.select().from(parseTestConcept).where(eq(parseTestConcept.courseId, course.id)),
    db.select().from(parseTestContact).where(eq(parseTestContact.courseId, course.id)),
    db.select().from(parseTestGradingItem).where(eq(parseTestGradingItem.courseId, course.id)),
    db.select().from(parseTestAssignment).where(eq(parseTestAssignment.courseId, course.id)),
    db.select().from(parseTestEvent).where(eq(parseTestEvent.courseId, course.id)),
  ]);

  const sortedConcepts = [...concepts].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedContacts = [...contacts].sort((a, b) => {
    const rank = (role: string) => {
      const lowered = role.toLowerCase();
      if (lowered === "professor") {
        return 0;
      }
      if (lowered === "instructor") {
        return 1;
      }
      if (lowered === "ta") {
        return 2;
      }
      return 3;
    };

    return rank(a.role) - rank(b.role) || a.displayOrder - b.displayOrder;
  });
  const sortedGradingItems = [...gradingItems].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedAssignments = [...assignments].sort((a, b) => {
    if (a.dueAt && b.dueAt) {
      return a.dueAt.getTime() - b.dueAt.getTime() || a.displayOrder - b.displayOrder;
    }

    if (a.dueAt) {
      return -1;
    }

    if (b.dueAt) {
      return 1;
    }

    return a.displayOrder - b.displayOrder;
  });
  const sortedEvents = [...events].sort((a, b) => {
    if (a.dueAt && b.dueAt) {
      return a.dueAt.getTime() - b.dueAt.getTime() || a.displayOrder - b.displayOrder;
    }

    if (a.dueAt) {
      return -1;
    }

    if (b.dueAt) {
      return 1;
    }

    return a.displayOrder - b.displayOrder;
  });

  return {
    run: {
      id: run.id,
      contentHash: run.contentHash,
      parseModel: run.parseModel,
      parseStatus: run.parseStatus as ParseStatus,
      warnings: run.warnings.filter(isHighSignalWarning),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    },
    course: {
      id: course.id,
      title: course.title,
      courseCode: course.courseCode,
      courseSection: course.courseSection,
      term: course.term,
      instructorName: course.instructorName,
      meetingDays: course.meetingDays,
      meetingTime: course.meetingTime,
      meetingLocation: course.meetingLocation,
      requiredMaterials: course.requiredMaterials,
      homeworkTools: course.homeworkTools,
      catalogDescription: course.catalogDescription,
      studentSummary: course.studentSummary,
      descriptionSource: course.descriptionSource,
    },
    concepts: sortedConcepts.map((concept) => ({
      id: concept.id,
      label: concept.label,
      displayOrder: concept.displayOrder,
    })),
    contacts: sortedContacts.map((contact) => ({
      id: contact.id,
      role: contact.role,
      name: contact.name,
      email: contact.email,
      officeHours: contact.officeHours,
      location: contact.location,
      sourceSnippet: contact.sourceSnippet,
      displayOrder: contact.displayOrder,
    })),
    gradingItems: sortedGradingItems.map((item) => ({
      id: item.id,
      label: item.label,
      weightPercent: normalisePercent(item.weightPercent) ?? 0,
      sourceSnippet: item.sourceSnippet,
      displayOrder: item.displayOrder,
    })),
    assignments: sortedAssignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      category: assignment.category,
      dateText: assignment.dateText,
      dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
      timeText: assignment.timeText,
      weightPercent: normalisePercent(assignment.weightPercent),
      sourceSnippet: assignment.sourceSnippet,
      displayOrder: assignment.displayOrder,
    })),
    events: sortedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      category: event.category,
      dateText: event.dateText,
      dueAt: event.dueAt ? event.dueAt.toISOString() : null,
      timeText: event.timeText,
      location: event.location,
      sourceSnippet: event.sourceSnippet,
      displayOrder: event.displayOrder,
    })),
  };
}

export async function updateParseTestReviewedValues(
  userId: string,
  payload: ParseTestReviewUpdate,
) {
  const run = await getRunById(userId, payload.runId);

  if (!run) {
    return null;
  }

  const courses = await db
    .select()
    .from(parseTestCourse)
    .where(eq(parseTestCourse.runId, run.id))
    .limit(1);
  const course = courses[0];

  if (!course) {
    return null;
  }

  const now = new Date();

  await db
    .update(parseTestCourse)
    .set({
      title: payload.course.title,
      courseCode: payload.course.courseCode,
      courseSection: payload.course.courseSection,
      term: payload.course.term,
      instructorName: payload.course.instructorName,
      meetingDays: payload.course.meetingDays,
      meetingTime: payload.course.meetingTime,
      meetingLocation: payload.course.meetingLocation,
      requiredMaterials: payload.course.requiredMaterials,
      homeworkTools: payload.course.homeworkTools,
      catalogDescription: payload.course.catalogDescription,
      studentSummary: payload.course.studentSummary,
      descriptionSource: payload.course.descriptionSource,
      updatedAt: now,
    })
    .where(eq(parseTestCourse.id, course.id));

  await Promise.all([
    db.delete(parseTestConcept).where(eq(parseTestConcept.courseId, course.id)),
    db.delete(parseTestContact).where(eq(parseTestContact.courseId, course.id)),
    db.delete(parseTestGradingItem).where(eq(parseTestGradingItem.courseId, course.id)),
    db.delete(parseTestAssignment).where(eq(parseTestAssignment.courseId, course.id)),
    db.delete(parseTestEvent).where(eq(parseTestEvent.courseId, course.id)),
  ]);

  if (payload.concepts.length > 0) {
    await db.insert(parseTestConcept).values(
      payload.concepts.map((concept, index) => ({
        id: randomUUID(),
        courseId: course.id,
        label: concept.label,
        displayOrder: index,
      })),
    );
  }

  if (payload.contacts.length > 0) {
    await db.insert(parseTestContact).values(
      payload.contacts.map((contact, index) => ({
        id: randomUUID(),
        courseId: course.id,
        role: contact.role,
        name: contact.name,
        email: contact.email,
        officeHours: contact.officeHours,
        location: contact.location,
        sourceSnippet: contact.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.gradingItems.length > 0) {
    await db.insert(parseTestGradingItem).values(
      payload.gradingItems.map((item, index) => ({
        id: randomUUID(),
        courseId: course.id,
        label: item.label,
        weightPercent: item.weightPercent,
        sourceSnippet: item.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.assignments.length > 0) {
    await db.insert(parseTestAssignment).values(
      payload.assignments.map((assignment, index) => ({
        id: randomUUID(),
        courseId: course.id,
        title: assignment.title,
        category: assignment.category,
        dateText: assignment.dateText,
        dueAt: parseIsoDate(assignment.dueAt),
        timeText: assignment.timeText,
        weightPercent: assignment.weightPercent,
        sourceSnippet: assignment.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  if (payload.events.length > 0) {
    await db.insert(parseTestEvent).values(
      payload.events.map((event, index) => ({
        id: randomUUID(),
        courseId: course.id,
        title: event.title,
        category: event.category,
        dateText: event.dateText,
        dueAt: parseIsoDate(event.dueAt),
        timeText: event.timeText,
        location: event.location,
        sourceSnippet: event.sourceSnippet,
        displayOrder: index,
      })),
    );
  }

  await db
    .update(parseTestRun)
    .set({
      updatedAt: now,
    })
    .where(eq(parseTestRun.id, run.id));

  return getParseTestViewModelForRun(userId, run.id);
}

export async function deleteParseTestRunRecord(params: { userId: string; runId: string }) {
  const run = await getRunById(params.userId, params.runId);

  if (!run) {
    return null;
  }

  await db.delete(parseTestRun).where(and(eq(parseTestRun.id, params.runId), eq(parseTestRun.userId, params.userId)));
  const nextRunId = await getLatestCompletedRunId(params.userId);

  return { nextRunId };
}
