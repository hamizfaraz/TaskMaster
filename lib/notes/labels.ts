/**
 * Shared title / class label formatting used by the Notes workspace and the
 * Cheat Sheet workspace. Extracted so both panels render identical labels.
 */

export type ClassLabelInput = {
  title: string;
  courseCode: string | null;
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function formatTimestamp(value: string) {
  return TIMESTAMP_FORMATTER.format(new Date(value));
}

export function getRenderableTitle(value: string) {
  return value.trim() || "Untitled";
}

/** Full label used in tooltips and accessible names. */
export function getClassLabel(item: ClassLabelInput) {
  return item.courseCode ? `${item.courseCode} ${item.title}` : item.title;
}

/**
 * Short label for compact sidebar contexts.
 * Uses the course code when available (e.g. "CS/CE 4337.006").
 * Falls back to an acronym when there is no code.
 */
export function getClassShortLabel(item: ClassLabelInput) {
  if (item.courseCode) return item.courseCode;
  const skip = new Set([
    "a",
    "an",
    "the",
    "of",
    "in",
    "to",
    "for",
    "and",
    "or",
    "at",
    "by",
  ]);
  const words = item.title.split(/\s+/).filter(Boolean);
  const acronym = words
    .filter((w) => !skip.has(w.toLowerCase()))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (acronym.length <= 1 || item.title.length <= 18) return item.title;
  return acronym;
}
