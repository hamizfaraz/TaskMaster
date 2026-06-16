import type { CheatSheet } from "@/lib/cheat-sheets/records";

/** Minimal class info needed to file and label cheat sheets. */
export type CheatSheetClass = {
  id: string;
  title: string;
  courseCode: string | null;
};

export const isTempSheet = (id: string) => id.startsWith("temp-");

export function createTempSheet(
  classId: string | null,
  overrides?: Partial<CheatSheet>,
): CheatSheet {
  const now = new Date().toISOString();
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "Untitled",
    classId,
    createdAt: now,
    updatedAt: now,
    content: { markdown: "", document: { time: Date.now(), blocks: [] } },
    ...overrides,
  };
}
