import { CLASS_ARCHIVE_WARNING } from "@/lib/classes/archive-marker";
import type { ParseTestEventPayload, ParseTestPayload } from "./contracts";
import { parseTestPayloadSchema } from "./contracts";
import { ParseTestError } from "./errors";

function normaliseNullableText(value: string | null) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalisePercent(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.round(scaled * 100) / 100;
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normaliseStringList(values: string[]) {
  return dedupeByKey(
    values.map((value) => value.trim()).filter((value) => value.length > 0),
    (value) => value.toLowerCase(),
  );
}

function normaliseRole(role: string) {
  const trimmed = role.trim();
  const lowered = trimmed.toLowerCase();

  if (lowered.includes("teaching assistant") || lowered === "ta" || lowered.includes("ta ")) {
    return "TA";
  }

  if (lowered.includes("prof")) {
    return "Professor";
  }

  if (lowered.includes("instructor")) {
    return "Instructor";
  }

  return trimmed;
}

function normaliseEmail(value: string | null) {
  const normalized = normaliseNullableText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function splitExplicitDateTextVariants(dateText: string) {
  const normalized = dateText.replace(/\s+/g, " ").trim();
  const monthPattern =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b/gi;
  const monthMatches = dedupeByKey(
    Array.from(normalized.matchAll(monthPattern), (match) => match[0].trim()),
    (value) => value.toLowerCase(),
  );

  if (monthMatches.length >= 2) {
    return monthMatches;
  }

  const sameMonthMatch = normalized.match(
    /^((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?)\s+(.+)$/i,
  );

  if (!sameMonthMatch || !/[,&-]|\band\b/i.test(normalized)) {
    return [normalized];
  }

  const [, month, rest] = sameMonthMatch;
  const dayMatches = dedupeByKey(
    Array.from(rest.matchAll(/\b\d{1,2}\b/g), (match) => match[0]),
    (value) => value,
  );

  if (dayMatches.length < 2) {
    return [normalized];
  }

  return dayMatches.map((day) => `${month} ${day}`);
}

function expandEventDates(event: ParseTestEventPayload): ParseTestEventPayload[] {
  if (normaliseNullableText(event.isoDate)) {
    return [event];
  }

  const variants = splitExplicitDateTextVariants(event.dateText);
  if (variants.length <= 1) {
    return [event];
  }

  return variants.map((dateText) => ({
    ...event,
    dateText,
  }));
}

function toAssignmentBackedEvent(assignment: ParseTestPayload["assignments"][number]): ParseTestEventPayload {
  return {
    title: assignment.title,
    category: assignment.category,
    dateText: assignment.dateText,
    isoDate: assignment.isoDate,
    timeText: assignment.timeText,
    location: null,
    sourceSnippet: assignment.sourceSnippet,
  };
}

export function isHighSignalWarning(warning: string) {
  if (warning === CLASS_ARCHIVE_WARNING) {
    return false;
  }

  const lowered = warning.toLowerCase();

  if (lowered.includes("does not provide specific due dates")) {
    return false;
  }

  if (lowered.includes("number of quizzes")) {
    return false;
  }

  if (lowered.includes("implies there are exactly four assignments")) {
    return false;
  }

  return true;
}

export function parseIsoDate(isoDate: string | null) {
  if (!isoDate) {
    return null;
  }

  const trimmed = isoDate.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00.000Z` : trimmed;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalisePayload(payload: ParseTestPayload): ParseTestPayload {
  const assignments = payload.assignments.map((assignment) => ({
    ...assignment,
    title: assignment.title.trim(),
    category: assignment.category.trim(),
    dateText: assignment.dateText.trim(),
    isoDate: normaliseNullableText(assignment.isoDate),
    timeText: normaliseNullableText(assignment.timeText),
    weight: normalisePercent(assignment.weight),
    sourceSnippet: assignment.sourceSnippet.trim(),
  }));

  const contacts = dedupeByKey(
    payload.contacts
      .map((contact) => ({
        ...contact,
        role: normaliseRole(contact.role),
        name: contact.name.trim(),
        email: normaliseEmail(contact.email),
        officeHours: normaliseNullableText(contact.officeHours),
        location: normaliseNullableText(contact.location),
        sourceSnippet: contact.sourceSnippet.trim(),
      }))
      .filter((contact) => contact.name.length > 0),
    (contact) => `${contact.role.toLowerCase()}|${contact.name.toLowerCase()}|${contact.email ?? ""}`,
  );

  const directEvents = payload.events
    .map((event) => ({
      ...event,
      title: event.title.trim(),
      category: event.category.trim(),
      dateText: event.dateText.trim(),
      isoDate: normaliseNullableText(event.isoDate),
      timeText: normaliseNullableText(event.timeText),
      location: normaliseNullableText(event.location),
      sourceSnippet: event.sourceSnippet.trim(),
    }))
    .flatMap(expandEventDates);

  const assignmentBackedEvents = assignments.map(toAssignmentBackedEvent).flatMap(expandEventDates);
  const events = dedupeByKey([...directEvents, ...assignmentBackedEvents], (event) =>
    [
      event.title.trim().toLowerCase(),
      event.category.trim().toLowerCase(),
      (event.isoDate ?? "").toLowerCase(),
      event.dateText.trim().toLowerCase(),
      (event.timeText ?? "").toLowerCase(),
    ].join("|"),
  );

  return {
    ...payload,
    courseCode: normaliseNullableText(payload.courseCode),
    courseSection: normaliseNullableText(payload.courseSection),
    term: normaliseNullableText(payload.term),
    instructorName: normaliseNullableText(payload.instructorName),
    meetingDays: normaliseNullableText(payload.meetingDays),
    meetingTime: normaliseNullableText(payload.meetingTime),
    meetingLocation: normaliseNullableText(payload.meetingLocation),
    requiredMaterials: normaliseStringList(payload.requiredMaterials),
    homeworkTools: normaliseStringList(payload.homeworkTools),
    catalogDescription: normaliseNullableText(payload.catalogDescription),
    keyConcepts: payload.keyConcepts
      .map((concept) => concept.trim())
      .filter((concept, index, list) => concept.length > 0 && list.indexOf(concept) === index),
    contacts,
    gradingBreakdown: payload.gradingBreakdown.map((item) => ({
      ...item,
      label: item.label.trim(),
      weight: normalisePercent(item.weight) ?? 0,
      sourceSnippet: item.sourceSnippet.trim(),
    })),
    assignments,
    events,
    warnings: payload.warnings
      .map((warning) => warning.trim())
      .filter(
        (warning, index, list) =>
          warning.length > 0 && list.indexOf(warning) === index && isHighSignalWarning(warning),
      ),
  };
}

export function parsePayloadText(responseText: string) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new ParseTestError("Gemini did not return valid JSON for the syllabus parse.", 502);
  }

  const result = parseTestPayloadSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ParseTestError(
      `Gemini returned JSON that did not match the ParseTest schema: ${result.error.issues
        .map((issue) => issue.path.join(".") || "root")
        .join(", ")}`,
      502,
    );
  }

  return normalisePayload(result.data);
}
