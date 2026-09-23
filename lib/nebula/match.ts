import type { ParseTestPayload } from "@/lib/parse-test/contracts";
import type { NebulaCourseSection } from "./client";
import { searchNebulaCourseSections } from "./client";

export type NebulaSectionMatch = {
  section: NebulaCourseSection;
  confidence: number;
  reasons: string[];
};

const COURSE_CODE_PATTERN = /\b([A-Z]{2,5})\s*[- ]?\s*([0-9]{4}[A-Z]?)\b/i;

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeWords(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseCourseCode(payload: ParseTestPayload) {
  const candidates = [
    payload.courseCode,
    payload.courseTitle,
    payload.studentSummary,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const match = candidate.match(COURSE_CODE_PATTERN);
    if (match) {
      return {
        subjectPrefix: match[1].toUpperCase(),
        courseNumber: match[2].toUpperCase(),
      };
    }
  }

  return null;
}

function getCourseDetail(section: NebulaCourseSection) {
  return section.course_details[0] ?? null;
}

function getProfessorNames(section: NebulaCourseSection) {
  const detailedNames = section.professor_details
    .map((professor) =>
      [professor.first_name, professor.last_name]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ")
        .trim(),
    )
    .filter(Boolean);

  if (detailedNames.length > 0) {
    return detailedNames;
  }

  return section.professors.filter((name) => name.trim().length > 0);
}

function getProfessorEmails(section: NebulaCourseSection) {
  return section.professor_details
    .map((professor) => professor.email?.trim())
    .filter((email): email is string => Boolean(email));
}

function hasTermMatch(payloadTerm: string | null, nebulaTerm: string | null | undefined) {
  const payloadWords = normalizeWords(payloadTerm);
  const nebulaWords = normalizeWords(nebulaTerm);
  if (payloadWords.length === 0 || nebulaWords.length === 0) {
    return false;
  }

  const payloadYears = payloadWords.filter((word) => /^\d{4}$/.test(word));
  const nebulaYears = nebulaWords.filter((word) => /^\d{4}$/.test(word));
  const seasons = ["spring", "summer", "fall", "winter"];
  const payloadSeason = payloadWords.find((word) => seasons.includes(word));
  const nebulaSeason = nebulaWords.find((word) => seasons.includes(word));

  return Boolean(
    payloadYears.some((year) => nebulaYears.includes(year)) &&
      payloadSeason &&
      payloadSeason === nebulaSeason,
  );
}

function hasProfessorMatch(payloadInstructor: string | null, professorNames: string[]) {
  const payloadWords = normalizeWords(payloadInstructor);
  if (payloadWords.length === 0 || professorNames.length === 0) {
    return false;
  }

  const payloadLastName = payloadWords[payloadWords.length - 1];
  return professorNames.some((name) => {
    const words = normalizeWords(name);
    return words.includes(payloadLastName);
  });
}

function scoreSection(payload: ParseTestPayload, section: NebulaCourseSection) {
  let confidence = 0;
  const reasons: string[] = [];
  const detail = getCourseDetail(section);
  const payloadSection = normalize(payload.courseSection);
  const nebulaSection = normalize(section.section_number);
  const professorNames = getProfessorNames(section);

  if (detail?.title && normalize(detail.title) === normalize(payload.courseTitle)) {
    confidence += 10;
    reasons.push("course title matched");
  }

  if (payloadSection && nebulaSection && payloadSection === nebulaSection) {
    confidence += 45;
    reasons.push("section number matched");
  }

  if (hasTermMatch(payload.term, section.academic_session?.name)) {
    confidence += 30;
    reasons.push("term matched");
  }

  if (hasProfessorMatch(payload.instructorName, professorNames)) {
    confidence += 25;
    reasons.push("instructor matched");
  }

  return { confidence, reasons };
}

function formatLocation(location: NebulaCourseSection["meetings"][number]["location"]) {
  if (!location) {
    return null;
  }

  return [location.building, location.room]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
}

function formatMeetingTime(meeting: NebulaCourseSection["meetings"][number]) {
  return [meeting.start_time, meeting.end_time]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("-");
}

function summarizeMeetings(section: NebulaCourseSection) {
  return section.meetings
    .map((meeting) => {
      const days = meeting.meeting_days?.join("") ?? "";
      const time = formatMeetingTime(meeting);
      const location = formatLocation(meeting.location);
      return [days, time, location].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

export function toNebulaCourseSectionCacheRow(section: NebulaCourseSection) {
  const detail = getCourseDetail(section);
  const professorNames = getProfessorNames(section);
  const professorEmails = getProfessorEmails(section);

  return {
    id: section._id,
    subjectPrefix: detail?.subject_prefix ?? null,
    courseNumber: detail?.course_number ?? null,
    courseTitle: detail?.title ?? null,
    sectionNumber: section.section_number ?? null,
    academicSessionName: section.academic_session?.name ?? null,
    academicSessionStartDate: section.academic_session?.start_date ?? null,
    academicSessionEndDate: section.academic_session?.end_date ?? null,
    professorNames,
    professorEmails,
    instructionMode: section.instruction_mode ?? null,
    meetingSummary: summarizeMeetings(section) || null,
    syllabusUri: section.syllabus_uri ?? null,
    raw: section,
  };
}

export function applyNebulaSectionToPayload(
  payload: ParseTestPayload,
  section: NebulaCourseSection,
): ParseTestPayload {
  const detail = getCourseDetail(section);
  const professorNames = getProfessorNames(section);
  const meetingSummary = summarizeMeetings(section);

  return {
    ...payload,
    courseTitle: detail?.title?.trim() || payload.courseTitle,
    courseCode:
      detail?.subject_prefix && detail.course_number
        ? `${detail.subject_prefix} ${detail.course_number}`
        : payload.courseCode,
    courseSection: section.section_number?.trim() || payload.courseSection,
    term: section.academic_session?.name?.trim() || payload.term,
    instructorName: professorNames.join(", ") || payload.instructorName,
    meetingDays:
      section.meetings
        .flatMap((meeting) => meeting.meeting_days ?? [])
        .filter(Boolean)
        .join(", ") || payload.meetingDays,
    meetingTime:
      section.meetings.map(formatMeetingTime).filter(Boolean).join("; ") ||
      payload.meetingTime,
    meetingLocation:
      section.meetings
        .map((meeting) => formatLocation(meeting.location))
        .filter(Boolean)
        .join("; ") ||
      meetingSummary ||
      payload.meetingLocation,
  };
}

export async function findBestNebulaSectionForPayload(
  payload: ParseTestPayload,
): Promise<NebulaSectionMatch | null> {
  const courseCode = parseCourseCode(payload);
  if (!courseCode) {
    return null;
  }

  const sections = await searchNebulaCourseSections(courseCode);
  const matches = sections
    .map((section) => {
      const scored = scoreSection(payload, section);
      return {
        section,
        confidence: scored.confidence,
        reasons: scored.reasons,
      };
    })
    .toSorted((a, b) => b.confidence - a.confidence);

  const best = matches[0] ?? null;
  if (!best || best.confidence < 35) {
    return null;
  }

  return best;
}
