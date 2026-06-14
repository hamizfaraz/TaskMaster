"use client";

import { useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  PanelLeftClose,
  Plus,
} from "lucide-react";
import { cx } from "@/lib/utils";
import {
  formatTimestamp,
  getClassLabel,
  getClassShortLabel,
  getRenderableTitle,
} from "@/lib/notes/labels";
import { sortCheatSheets, type CheatSheet } from "@/lib/cheat-sheets/records";
import { isTempSheet, type CheatSheetClass } from "./cheat-sheet-types";

type CheatSheetListProps = {
  cheatSheets: CheatSheet[];
  classes: CheatSheetClass[];
  selectedId: string | null;
  collapsedGroups: Set<string>;
  isPending: boolean;
  disabled: boolean;
  onToggleGroup: (groupId: string) => void;
  onSelect: (sheet: CheatSheet) => void;
  onCreate: (classId: string | null) => void;
  onCollapse: () => void;
};

function CheatSheetItem({
  sheet,
  isOpen,
  compact,
  classLabel,
  classShortLabel,
  onSelect,
}: {
  sheet: CheatSheet;
  isOpen: boolean;
  compact?: boolean;
  classLabel: string | null;
  classShortLabel: string | null;
  onSelect: (sheet: CheatSheet) => void;
}) {
  const isTemp = isTempSheet(sheet.id);
  return (
    <button
      type="button"
      disabled={isTemp}
      onClick={() => onSelect(sheet)}
      className={cx(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
        isOpen
          ? "bg-surface-elevated text-foreground"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
        isTemp && "animate-pulse opacity-60",
      )}
    >
      <FileText className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {getRenderableTitle(sheet.title)}
      </span>
      {compact && classShortLabel ? (
        <span
          title={classLabel ?? undefined}
          className="max-w-24 shrink-0 truncate text-[11px] text-muted-foreground"
        >
          {classShortLabel}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatTimestamp(sheet.updatedAt)}
        </span>
      )}
    </button>
  );
}

export function CheatSheetList({
  cheatSheets,
  classes,
  selectedId,
  collapsedGroups,
  isPending,
  disabled,
  onToggleGroup,
  onSelect,
  onCreate,
  onCollapse,
}: CheatSheetListProps) {
  const classesById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes],
  );
  const recents = useMemo(
    () => sortCheatSheets(cheatSheets).slice(0, 8),
    [cheatSheets],
  );
  const groups = useMemo(
    () => [
      ...classes.map((item) => ({
        id: item.id,
        title: getClassLabel(item),
        shortTitle: getClassShortLabel(item),
        classId: item.id as string | null,
        sheets: cheatSheets.filter((sheet) => sheet.classId === item.id),
      })),
      {
        id: "unfiled",
        title: "Unfiled",
        shortTitle: "Unfiled",
        classId: null as string | null,
        sheets: cheatSheets.filter((sheet) => !sheet.classId),
      },
    ],
    [classes, cheatSheets],
  );

  const labelFor = (classId: string | null) => {
    const cls = classId ? (classesById.get(classId) ?? null) : null;
    return {
      full: cls ? getClassLabel(cls) : null,
      short: cls ? getClassShortLabel(cls) : null,
    };
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-b border-border bg-surface-muted/70 lg:border-b-0 lg:border-r">
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={() => onCreate(null)}
          disabled={isPending || disabled}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">New cheat sheet</span>
        </button>
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Collapse cheat sheet list"
          title="Collapse cheat sheet list"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
        {recents.length > 0 ? (
          <section className="mb-5">
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              Recents
            </div>
            <div className="space-y-0.5">
              {recents.map((sheet) => {
                const labels = labelFor(sheet.classId);
                return (
                  <CheatSheetItem
                    key={sheet.id}
                    sheet={sheet}
                    isOpen={sheet.id === selectedId}
                    compact
                    classLabel={labels.full}
                    classShortLabel={labels.short}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="space-y-1">
          <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
            Cheat sheets
          </div>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id} className="rounded-lg">
                <div className="group flex items-center gap-1 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.title}`}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm font-medium"
                  >
                    <Folder
                      className="h-4 w-4 shrink-0 opacity-70"
                      aria-hidden="true"
                    />
                    <span className="truncate" title={group.title}>
                      {group.shortTitle}
                    </span>
                    <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
                      {group.sheets.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreate(group.classId)}
                    disabled={isPending || disabled}
                    className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 hover:bg-surface-elevated group-hover:opacity-100 disabled:opacity-40"
                    aria-label={`New cheat sheet in ${group.title}`}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                {!isCollapsed && group.sheets.length > 0 ? (
                  <div className="ml-3 space-y-0.5 border-l border-border/70 pl-1">
                    {group.sheets.map((sheet) => (
                      <CheatSheetItem
                        key={sheet.id}
                        sheet={sheet}
                        isOpen={sheet.id === selectedId}
                        classLabel={null}
                        classShortLabel={null}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </aside>
  );
}
