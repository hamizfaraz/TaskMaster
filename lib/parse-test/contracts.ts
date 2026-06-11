import { z } from "zod";

export const MAX_PARSE_TEST_FILE_BYTES = 20 * 1024 * 1024;

export const parseStatusValues = ["processing", "completed", "failed"] as const;
export type ParseStatus = (typeof parseStatusValues)[number];

export const descriptionSourceValues = [
  "catalog_description",
  "course_objectives",
  "learning_outcomes",
  "inferred_from_topics",
] as const;
export type DescriptionSource = (typeof descriptionSourceValues)[number];

const assignmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  dateText: z.string().trim().min(1).max(200),
  isoDate: z.string().trim().max(64).nullable(),
  timeText: z.string().trim().max(100).nullable(),
  weight: z.number().min(0).max(100).nullable(),
  sourceSnippet: z.string().trim().min(1).max(500),
});

const gradingItemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  weight: z.number().min(0).max(100),
  sourceSnippet: z.string().trim().min(1).max(500),
});

const contactSchema = z.object({
  role: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().max(200).nullable(),
  officeHours: z.string().trim().max(300).nullable(),
  location: z.string().trim().max(200).nullable(),
  sourceSnippet: z.string().trim().min(1).max(500),
});

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  dateText: z.string().trim().min(1).max(200),
  isoDate: z.string().trim().max(64).nullable(),
  timeText: z.string().trim().max(100).nullable(),
  location: z.string().trim().max(200).nullable(),
  sourceSnippet: z.string().trim().min(1).max(500),
});

export const parseTestPayloadSchema = z.object({
  courseTitle: z.string().trim().min(1).max(200),
  courseCode: z.string().trim().max(100).nullable(),
  courseSection: z.string().trim().max(100).nullable(),
  term: z.string().trim().max(120).nullable(),
  instructorName: z.string().trim().max(160).nullable(),
  meetingDays: z.string().trim().max(160).nullable(),
  meetingTime: z.string().trim().max(160).nullable(),
  meetingLocation: z.string().trim().max(200).nullable(),
  requiredMaterials: z.array(z.string().trim().min(1).max(300)).max(30),
  homeworkTools: z.array(z.string().trim().min(1).max(200)).max(20),
  catalogDescription: z.string().trim().max(4000).nullable(),
  studentSummary: z.string().trim().min(1).max(1000),
  descriptionSource: z.enum(descriptionSourceValues),
  keyConcepts: z.array(z.string().trim().min(1).max(100)).max(20),
  contacts: z.array(contactSchema).max(20),
  gradingBreakdown: z.array(gradingItemSchema).max(20),
  assignments: z.array(assignmentSchema).max(100),
  events: z.array(eventSchema).max(200),
  warnings: z
    .array(z.string().trim().max(300).nullable())
    .max(20)
    .transform((warnings) => warnings.filter((warning): warning is string => Boolean(warning?.trim()))),
});

const reviewCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  courseCode: z.string().trim().max(100).nullable(),
  courseSection: z.string().trim().max(100).nullable(),
  term: z.string().trim().max(120).nullable(),
  instructorName: z.string().trim().max(160).nullable(),
  meetingDays: z.string().trim().max(160).nullable(),
  meetingTime: z.string().trim().max(160).nullable(),
  meetingLocation: z.string().trim().max(200).nullable(),
  requiredMaterials: z.array(z.string().trim().min(1).max(300)).max(30),
  homeworkTools: z.array(z.string().trim().min(1).max(200)).max(20),
  catalogDescription: z.string().trim().max(4000).nullable(),
  studentSummary: z.string().trim().min(1).max(1000),
  descriptionSource: z.enum(descriptionSourceValues),
});

const reviewConceptSchema = z.object({
  label: z.string().trim().min(1).max(100),
});

const reviewGradingItemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  weightPercent: z.number().min(0).max(100),
  sourceSnippet: z.string().trim().min(1).max(500),
});

const reviewAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  dateText: z.string().trim().min(1).max(200),
  dueAt: z.string().trim().max(64).nullable(),
  timeText: z.string().trim().max(100).nullable(),
  weightPercent: z.number().min(0).max(100).nullable(),
  sourceSnippet: z.string().trim().min(1).max(500),
});

const reviewEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  dateText: z.string().trim().min(1).max(200),
  dueAt: z.string().trim().max(64).nullable(),
  timeText: z.string().trim().max(100).nullable(),
  location: z.string().trim().max(200).nullable(),
  sourceSnippet: z.string().trim().min(1).max(500),
});

export const parseTestReviewUpdateSchema = z.object({
  runId: z.string().trim().min(1),
  course: reviewCourseSchema,
  concepts: z.array(reviewConceptSchema).max(20),
  contacts: z.array(contactSchema).max(20),
  gradingItems: z.array(reviewGradingItemSchema).max(20),
  assignments: z.array(reviewAssignmentSchema).max(100),
  events: z.array(reviewEventSchema).max(200),
});

export type ParseTestPayload = z.infer<typeof parseTestPayloadSchema>;
export type ParseTestAssignmentPayload = z.infer<typeof assignmentSchema>;
export type ParseTestGradingItemPayload = z.infer<typeof gradingItemSchema>;
export type ParseTestContactPayload = z.infer<typeof contactSchema>;
export type ParseTestEventPayload = z.infer<typeof eventSchema>;
export type ParseTestReviewUpdate = z.infer<typeof parseTestReviewUpdateSchema>;

export type ParseTestViewModel = {
  run: {
    id: string;
    contentHash: string;
    parseModel: string;
    parseStatus: ParseStatus;
    warnings: string[];
    createdAt: string;
    updatedAt: string;
  };
  course: {
    id: string;
    title: string;
    courseCode: string | null;
    courseSection: string | null;
    term: string | null;
    instructorName: string | null;
    meetingDays: string | null;
    meetingTime: string | null;
    meetingLocation: string | null;
    requiredMaterials: string[];
    homeworkTools: string[];
    catalogDescription: string | null;
    studentSummary: string;
    descriptionSource: DescriptionSource;
  };
  concepts: Array<{
    id: string;
    label: string;
    displayOrder: number;
  }>;
  contacts: Array<{
    id: string;
    role: string;
    name: string;
    email: string | null;
    officeHours: string | null;
    location: string | null;
    sourceSnippet: string;
    displayOrder: number;
  }>;
  gradingItems: Array<{
    id: string;
    label: string;
    weightPercent: number;
    sourceSnippet: string;
    displayOrder: number;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    category: string;
    dateText: string;
    dueAt: string | null;
    timeText: string | null;
    weightPercent: number | null;
    sourceSnippet: string;
    displayOrder: number;
  }>;
  events: Array<{
    id: string;
    title: string;
    category: string;
    dateText: string;
    dueAt: string | null;
    timeText: string | null;
    location: string | null;
    sourceSnippet: string;
    displayOrder: number;
  }>;
};

export type NormalizedParseTestSchedule = {
  course: {
    id: string;
    title: string;
    courseCode: string | null;
    courseSection: string | null;
    term: string | null;
    instructorName: string | null;
    meetingDays: string | null;
    meetingTime: string | null;
    meetingLocation: string | null;
    requiredMaterials: string[];
    homeworkTools: string[];
    summary: string;
  };
  contacts: ParseTestViewModel["contacts"];
  gradingItems: ParseTestViewModel["gradingItems"];
  topics: ParseTestViewModel["concepts"];
  assignments: ParseTestViewModel["assignments"];
  events: ParseTestViewModel["events"];
  parseIssues: string[];
};

export type ParseTestRunSummary = {
  runId: string;
  title: string;
  courseCode: string | null;
  term: string | null;
  updatedAt: string;
};

export const parseTestResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: [
    "courseTitle",
    "courseCode",
    "courseSection",
    "term",
    "instructorName",
    "meetingDays",
    "meetingTime",
    "meetingLocation",
    "requiredMaterials",
    "homeworkTools",
    "catalogDescription",
    "studentSummary",
    "descriptionSource",
    "keyConcepts",
    "contacts",
    "gradingBreakdown",
    "assignments",
    "events",
    "warnings",
  ],
  required: [
    "courseTitle",
    "requiredMaterials",
    "homeworkTools",
    "studentSummary",
    "descriptionSource",
    "keyConcepts",
    "contacts",
    "gradingBreakdown",
    "assignments",
    "events",
    "warnings",
  ],
  properties: {
    courseTitle: { type: "string" },
    courseCode: { anyOf: [{ type: "string" }, { type: "null" }] },
    courseSection: { anyOf: [{ type: "string" }, { type: "null" }] },
    term: { anyOf: [{ type: "string" }, { type: "null" }] },
    instructorName: { anyOf: [{ type: "string" }, { type: "null" }] },
    meetingDays: { anyOf: [{ type: "string" }, { type: "null" }] },
    meetingTime: { anyOf: [{ type: "string" }, { type: "null" }] },
    meetingLocation: { anyOf: [{ type: "string" }, { type: "null" }] },
    requiredMaterials: {
      type: "array",
      items: { type: "string" },
    },
    homeworkTools: {
      type: "array",
      items: { type: "string" },
    },
    catalogDescription: { anyOf: [{ type: "string" }, { type: "null" }] },
    studentSummary: { type: "string" },
    descriptionSource: {
      type: "string",
      enum: [...descriptionSourceValues],
    },
    keyConcepts: {
      type: "array",
      items: { type: "string" },
    },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: [
          "role",
          "name",
          "email",
          "officeHours",
          "location",
          "sourceSnippet",
        ],
        required: ["role", "name", "email", "officeHours", "location", "sourceSnippet"],
        properties: {
          role: { type: "string" },
          name: { type: "string" },
          email: { anyOf: [{ type: "string" }, { type: "null" }] },
          officeHours: { anyOf: [{ type: "string" }, { type: "null" }] },
          location: { anyOf: [{ type: "string" }, { type: "null" }] },
          sourceSnippet: { type: "string" },
        },
      },
    },
    gradingBreakdown: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: ["label", "weight", "sourceSnippet"],
        required: ["label", "weight", "sourceSnippet"],
        properties: {
          label: { type: "string" },
          weight: { type: "number" },
          sourceSnippet: { type: "string" },
        },
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: [
          "title",
          "category",
          "dateText",
          "isoDate",
          "timeText",
          "weight",
          "sourceSnippet",
        ],
        required: [
          "title",
          "category",
          "dateText",
          "isoDate",
          "timeText",
          "weight",
          "sourceSnippet",
        ],
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          dateText: { type: "string" },
          isoDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          timeText: { anyOf: [{ type: "string" }, { type: "null" }] },
          weight: { anyOf: [{ type: "number" }, { type: "null" }] },
          sourceSnippet: { type: "string" },
        },
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: [
          "title",
          "category",
          "dateText",
          "isoDate",
          "timeText",
          "location",
          "sourceSnippet",
        ],
        required: [
          "title",
          "category",
          "dateText",
          "isoDate",
          "timeText",
          "location",
          "sourceSnippet",
        ],
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          dateText: { type: "string" },
          isoDate: { anyOf: [{ type: "string" }, { type: "null" }] },
          timeText: { anyOf: [{ type: "string" }, { type: "null" }] },
          location: { anyOf: [{ type: "string" }, { type: "null" }] },
          sourceSnippet: { type: "string" },
        },
      },
    },
    warnings: {
      type: "array",
      items: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
} as const;
