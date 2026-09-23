import { z } from "zod";

const DEFAULT_NEBULA_API_BASE_URL = "https://api.utdnebula.com";
const MAX_SECTION_PAGES = 8;

const nebulaLocationSchema = z.object({
  building: z.string().nullable().optional(),
  map_uri: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
});

const nebulaMeetingSchema = z.object({
  end_date: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  location: nebulaLocationSchema.nullable().optional(),
  meeting_days: z.array(z.string()).nullable().optional(),
  modality: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  start_time: z.string().nullable().optional(),
});

const nebulaCourseDetailSchema = z.object({
  _id: z.string(),
  activity_type: z.string().nullable().optional(),
  catalog_year: z.string().nullable().optional(),
  class_level: z.string().nullable().optional(),
  course_number: z.string().nullable().optional(),
  credit_hours: z.string().nullable().optional(),
  subject_prefix: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

const nebulaProfessorSchema = z.object({
  _id: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  office: nebulaLocationSchema.nullable().optional(),
  office_hours: z.array(nebulaMeetingSchema).nullable().optional(),
  phone_number: z.string().nullable().optional(),
});

export const nebulaCourseSectionSchema = z.object({
  _id: z.string(),
  academic_session: z
    .object({
      end_date: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      start_date: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  attributes: z.string().nullable().optional(),
  core_flags: z.array(z.string()).nullable().optional(),
  course_details: z.array(nebulaCourseDetailSchema).default([]),
  course_reference: z.string().nullable().optional(),
  grade_distribution: z.array(z.number()).nullable().optional(),
  instruction_mode: z.string().nullable().optional(),
  internal_class_number: z.string().nullable().optional(),
  meetings: z.array(nebulaMeetingSchema).default([]),
  professor_details: z.array(nebulaProfessorSchema).default([]),
  professors: z.array(z.string()).default([]),
  section_corequisites: z.unknown().optional(),
  section_number: z.string().nullable().optional(),
  syllabus_uri: z.string().nullable().optional(),
  teaching_assistants: z
    .array(
      z.object({
        email: z.string().nullable().optional(),
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

const nebulaCourseSectionsResponseSchema = z.object({
  data: z.union([z.array(nebulaCourseSectionSchema), z.string()]),
  message: z.string().optional(),
  status: z.number().optional(),
});

export type NebulaCourseSection = z.infer<typeof nebulaCourseSectionSchema>;

export type SearchCourseSectionsParams = {
  subjectPrefix: string;
  courseNumber: string;
};

function getNebulaConfig() {
  const apiKey = process.env.NEBULA_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl:
      process.env.NEBULA_API_BASE_URL?.replace(/\/+$/, "") ??
      DEFAULT_NEBULA_API_BASE_URL,
  };
}

function buildCourseSectionsUrl(
  baseUrl: string,
  params: SearchCourseSectionsParams & {
    formerOffset: number;
    latterOffset: number;
  },
) {
  const url = new URL("/course/sections", baseUrl);
  url.searchParams.set("former_offset", String(params.formerOffset));
  url.searchParams.set("latter_offset", String(params.latterOffset));
  url.searchParams.set("subject_prefix", params.subjectPrefix);
  url.searchParams.set("course_number", params.courseNumber);
  return url;
}

async function fetchCourseSectionsPage(
  config: { apiKey: string; baseUrl: string },
  params: SearchCourseSectionsParams & {
    formerOffset: number;
    latterOffset: number;
  },
) {
  const response = await fetch(buildCourseSectionsUrl(config.baseUrl, params), {
    headers: {
      "x-api-key": config.apiKey,
      Accept: "application/json",
    },
  });

  const body = await response.json().catch(() => null);
  const parsed = nebulaCourseSectionsResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success || typeof parsed.data.data === "string") {
    const message =
      parsed.success && typeof parsed.data.data === "string"
        ? parsed.data.data
        : parsed.success
          ? parsed.data.message
          : undefined;
    throw new Error(message || `Nebula course section lookup failed (${response.status})`);
  }

  return parsed.data.data;
}

export async function searchNebulaCourseSections(
  params: SearchCourseSectionsParams,
): Promise<NebulaCourseSection[]> {
  const config = getNebulaConfig();
  if (!config) {
    console.info("[Nebula] NEBULA_API_KEY is not configured; skipping section lookup.");
    return [];
  }

  const sections: NebulaCourseSection[] = [];
  const seen = new Set<string>();
  let latterOffset = 0;

  console.info("[Nebula] Searching course sections.", {
    subjectPrefix: params.subjectPrefix,
    courseNumber: params.courseNumber,
  });

  for (let page = 0; page < MAX_SECTION_PAGES; page += 1) {
    const pageSections = await fetchCourseSectionsPage(config, {
      ...params,
      formerOffset: 0,
      latterOffset,
    });

    const newSections = pageSections.filter((section) => !seen.has(section._id));
    for (const section of newSections) {
      seen.add(section._id);
      sections.push(section);
    }

    console.info("[Nebula] Course section page received.", {
      subjectPrefix: params.subjectPrefix,
      courseNumber: params.courseNumber,
      page,
      latterOffset,
      returned: pageSections.length,
      newSections: newSections.length,
      totalSections: sections.length,
    });

    if (pageSections.length === 0 || newSections.length === 0) {
      break;
    }

    latterOffset += pageSections.length;
  }

  console.info("[Nebula] Section lookup complete.", {
    subjectPrefix: params.subjectPrefix,
    courseNumber: params.courseNumber,
    totalSections: sections.length,
  });

  return sections;
}
