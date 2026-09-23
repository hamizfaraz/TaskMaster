import type { ParseTestPayload } from "@/lib/parse-test/contracts";
import type { NebulaCourseSection } from "./client";
import {
  hydrateNebulaSectionProfessorDetails,
  searchNebulaCourseSections,
} from "./client";

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

function normalizeTerm(value: string | null | undefined) {
  const rawValue = value ?? "";
  const compactMatch = rawValue
    .toLowerCase()
    .match(/\b(?:(\d{2}|\d{4})\s*([fsuw])|([fsuw])\s*(\d{2}|\d{4}))\b/);

  if (compactMatch) {
    const yearText = compactMatch[1] ?? compactMatch[4] ?? "";
    const seasonCode = compactMatch[2] ?? compactMatch[3] ?? "";
    const year =
      yearText.length === 2 ? `20${yearText}` : yearText;
    const seasonByCode: Record<string, string> = {
      f: "fall",
      s: "spring",
      u: "summer",
      w: "winter",
    };

    return {
      year,
      season: seasonByCode[seasonCode] ?? null,
    };
  }

  const words = normalizeWords(rawValue);
  const year = words.find((word) => /^\d{4}$/.test(word)) ?? null;
  const seasons = ["spring", "summer", "fall", "winter"];
  const season = words.find((word) => seasons.includes(word)) ?? null;

  return { year, season };
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
  const payload = normalizeTerm(payloadTerm);
  const nebula = normalizeTerm(nebulaTerm);

  if (!payload.year || !payload.season || !nebula.year || !nebula.season) {
    return false;
  }

  return payload.year === nebula.year && payload.season === nebula.season;
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

function isLikelyRoomReference(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }

  return /\b[A-Z]{1,6}\s*\d+\.\d+\b/i.test(trimmed) || /\b\d+\.\d+\b/.test(trimmed);
}

function getMeetingLocationValues(section: NebulaCourseSection) {
  return section.meetings.flatMap((meeting) => {
    const location = meeting.location;
    if (!location) {
      return [];
    }

    return [
      formatLocation(location),
      location.building,
      location.room,
    ].filter((value): value is string => Boolean(value?.trim()));
  });
}

function hasMeetingLocationMatch(payload: ParseTestPayload, section: NebulaCourseSection) {
  const payloadLocations = [
    payload.meetingLocation,
    isLikelyRoomReference(payload.courseSection) ? payload.courseSection : null,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalize)
    .filter(Boolean);

  if (payloadLocations.length === 0) {
    return false;
  }

  return getMeetingLocationValues(section)
    .map(normalize)
    .filter(Boolean)
    .some((nebulaLocation) =>
      payloadLocations.some(
        (payloadLocation) =>
          nebulaLocation === payloadLocation ||
          nebulaLocation.endsWith(payloadLocation) ||
          nebulaLocation.includes(payloadLocation),
      ),
    );
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

  if (hasMeetingLocationMatch(payload, section)) {
    confidence += 20;
    reasons.push("meeting location matched");
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

function summarizeCandidate(match: NebulaSectionMatch) {
  const detail = getCourseDetail(match.section);
  const professorNames = getProfessorNames(match.section);

  return {
    confidence: match.confidence,
    reasons: match.reasons,
    nebulaSectionId: match.section._id,
    sectionNumber: match.section.section_number,
    term: match.section.academic_session?.name,
    courseTitle: detail?.title,
    professorNames,
    professorIds: match.section.professors,
    meetings: summarizeMeetings(match.section),
  };
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
  const initialMatches = sections
    .map((section) => {
      const scored = scoreSection(payload, section);
      return {
        section,
        confidence: scored.confidence,
        reasons: scored.reasons,
      };
    })
    .toSorted((a, b) => b.confidence - a.confidence);

  const hydratedSections = new Map<string, NebulaCourseSection>();
  const hydrationCandidates = initialMatches
    .filter((match) => match.confidence >= 20)
    .slice(0, 50);

  await Promise.all(
    hydrationCandidates.map(async (match) => {
      const hydrated = await hydrateNebulaSectionProfessorDetails(match.section);
      hydratedSections.set(hydrated._id, hydrated);
    }),
  );

  const matches = sections
    .map((section) => {
      const sectionForScoring = hydratedSections.get(section._id) ?? section;
      const scored = scoreSection(payload, sectionForScoring);
      return {
        section: sectionForScoring,
        confidence: scored.confidence,
        reasons: scored.reasons,
      };
    })
    .toSorted((a, b) => b.confidence - a.confidence);

  const best = matches[0] ?? null;
  if (!best || best.confidence < 35) {
    console.info("[Nebula] No confident section match. Top candidates:", {
      payload: {
        courseCode: payload.courseCode,
        courseSection: payload.courseSection,
        term: payload.term,
        instructorName: payload.instructorName,
        meetingLocation: payload.meetingLocation,
      },
      candidates: matches.slice(0, 8).map(summarizeCandidate),
    });
    return null;
  }

  const competingMatches = matches.filter(
    (match) => match.section._id !== best.section._id && match.confidence === best.confidence,
  );
  const hasStrongDisambiguator =
    best.reasons.includes("section number matched") ||
    best.reasons.includes("meeting location matched");

  if (competingMatches.length > 0 && !hasStrongDisambiguator) {
    console.info("[Nebula] Section match was ambiguous. Top candidates:", {
      payload: {
        courseCode: payload.courseCode,
        courseSection: payload.courseSection,
        term: payload.term,
        instructorName: payload.instructorName,
        meetingLocation: payload.meetingLocation,
      },
      candidates: [best, ...competingMatches].slice(0, 8).map(summarizeCandidate),
    });
    return null;
  }

  console.info("[Nebula] Section match selected.", {
    payload: {
      courseCode: payload.courseCode,
      courseSection: payload.courseSection,
      term: payload.term,
      instructorName: payload.instructorName,
      meetingLocation: payload.meetingLocation,
    },
    candidate: summarizeCandidate(best),
  });

  return best;
}
