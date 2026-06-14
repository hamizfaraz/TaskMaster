"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, FileText, Trash2 } from "lucide-react";
import { NoteSurface } from "@/components/note-editor/note-surface";
import { Button } from "@/components/ui/button";
import { formatTimestamp, getRenderableTitle } from "@/lib/notes/labels";
import {
  rowToCheatSheet,
  sortCheatSheets,
  type CheatSheet,
  type CheatSheetRecord,
} from "@/lib/cheat-sheets/records";
import type { NoteContent } from "@/lib/notes/types";
import {
  createTempSheet,
  isTempSheet,
  type CheatSheetClass,
} from "./cheat-sheet-types";
import { CheatSheetList } from "./cheat-sheet-list";

type CheatSheetWorkspaceProps = {
  initialCheatSheets: CheatSheet[];
  classes: CheatSheetClass[];
  storageReady: boolean;
};

export function CheatSheetWorkspace({
  initialCheatSheets,
  classes,
  storageReady,
}: CheatSheetWorkspaceProps) {
  const [sheets, setSheets] = useState(() =>
    sortCheatSheets(initialCheatSheets),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialCheatSheets[0]?.id ?? null,
  );
  const [titleDraftState, setTitleDraftState] = useState(() => ({
    sheetId: initialCheatSheets[0]?.id ?? null,
    value: initialCheatSheets[0]?.title ?? "Untitled",
  }));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [isPending, startTransition] = useTransition();

  const selectedSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0] ?? null,
    [sheets, selectedId],
  );
  const draftTitle =
    selectedSheet && titleDraftState.sheetId === selectedSheet.id
      ? titleDraftState.value
      : (selectedSheet?.title ?? "Untitled");

  async function readRecord(response: Response) {
    const payload = (await response.json().catch(() => null)) as
      | (CheatSheetRecord & { error?: string })
      | { error?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "The cheat sheet request failed.");
    }
    return rowToCheatSheet(payload as CheatSheetRecord);
  }

  function mergeSheet(next: CheatSheet) {
    setSheets((current) =>
      sortCheatSheets([next, ...current.filter((s) => s.id !== next.id)]),
    );
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function selectSheet(sheet: CheatSheet) {
    setSelectedId(sheet.id);
    setTitleDraftState({ sheetId: sheet.id, value: sheet.title });
  }

  async function saveSheet(
    sheetId: string,
    patch: { title?: string; content?: NoteContent; classId?: string | null },
  ) {
    if (isTempSheet(sheetId)) return; // creation pending — skip

    const response = await fetch(`/api/cheat-sheets/${sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.content ? { content: patch.content.document } : {}),
        ...(patch.classId !== undefined ? { classId: patch.classId } : {}),
      }),
    });

    const updated = await readRecord(response);
    mergeSheet(updated);
    setTitleDraftState((current) =>
      current.sheetId === updated.id
        ? { sheetId: updated.id, value: updated.title }
        : current,
    );
  }

  async function handleCreate(classId: string | null) {
    if (!storageReady) {
      toast.error("Cheat sheet storage is not ready", {
        description: "Run the latest database migration before writing.",
        duration: 5000,
      });
      return;
    }

    const temp = createTempSheet(classId);
    setSheets((current) => sortCheatSheets([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ sheetId: temp.id, value: "Untitled" });
    if (classId) {
      setCollapsedGroups((current) => {
        const next = new Set(current);
        next.delete(classId);
        return next;
      });
    }

    try {
      const response = await fetch("/api/cheat-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled",
          classId,
          content: temp.content.document,
        }),
      });
      const created = await readRecord(response);
      setSheets((current) =>
        sortCheatSheets([created, ...current.filter((s) => s.id !== temp.id)]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      setTitleDraftState((prev) =>
        prev.sheetId === temp.id
          ? { sheetId: created.id, value: created.title }
          : prev,
      );
    } catch (err) {
      setSheets((current) => current.filter((s) => s.id !== temp.id));
      setSelectedId((prev) => (prev === temp.id ? null : prev));
      toast.error("Could not create cheat sheet", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleDuplicate() {
    if (!selectedSheet || isTempSheet(selectedSheet.id)) return;
    const source = selectedSheet;
    const temp = createTempSheet(source.classId, {
      title: `${source.title} (copy)`,
      content: source.content,
    });

    setSheets((current) => sortCheatSheets([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ sheetId: temp.id, value: temp.title });

    try {
      const response = await fetch("/api/cheat-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: temp.title,
          classId: temp.classId,
          content: source.content.document,
        }),
      });
      const created = await readRecord(response);
      setSheets((current) =>
        sortCheatSheets([created, ...current.filter((s) => s.id !== temp.id)]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      setTitleDraftState((prev) =>
        prev.sheetId === temp.id
          ? { sheetId: created.id, value: created.title }
          : prev,
      );
    } catch (err) {
      setSheets((current) => current.filter((s) => s.id !== temp.id));
      setSelectedId(source.id);
      toast.error("Could not duplicate cheat sheet", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleDelete() {
    if (!selectedSheet || isTempSheet(selectedSheet.id)) return;
    const target = selectedSheet;
    const nextSheet = sheets.find((s) => s.id !== target.id) ?? null;

    setSheets((current) => current.filter((s) => s.id !== target.id));
    setSelectedId(nextSheet?.id ?? null);

    try {
      const response = await fetch(`/api/cheat-sheets/${target.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Could not delete the cheat sheet.");
      }
    } catch (err) {
      setSheets((current) => sortCheatSheets([target, ...current]));
      setSelectedId(target.id);
      toast.error("Could not delete cheat sheet", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleTitleCommit() {
    if (!selectedSheet || isTempSheet(selectedSheet.id)) return;
    const nextTitle = draftTitle.trim() || "Untitled";
    if (nextTitle === getRenderableTitle(selectedSheet.title)) return;
    try {
      await saveSheet(selectedSheet.id, { title: nextTitle });
    } catch (err) {
      toast.error("Could not save title", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[260px_minmax(0,1fr)]">
      <CheatSheetList
        cheatSheets={sheets}
        classes={classes}
        selectedId={selectedSheet?.id ?? null}
        collapsedGroups={collapsedGroups}
        isPending={isPending}
        disabled={!storageReady}
        onToggleGroup={toggleGroup}
        onSelect={selectSheet}
        onCreate={(classId) =>
          startTransition(() => void handleCreate(classId))
        }
      />

      <section className="h-full min-h-0 bg-background">
        {selectedSheet ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-foreground">
                  {getRenderableTitle(draftTitle)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDuplicate()}
                  disabled={isPending || isTempSheet(selectedSheet.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                  aria-label="Duplicate cheat sheet"
                  title="Duplicate cheat sheet"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isPending || isTempSheet(selectedSheet.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-60"
                  aria-label="Delete cheat sheet"
                  title="Delete cheat sheet"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <NoteSurface
                initialDocument={selectedSheet.content.document}
                keepEditingWhenEmpty
                selectionPrelude={
                  <div className="mx-auto w-full px-4 pt-7 md:px-10 md:pt-10">
                    <input
                      data-note-selection-region
                      value={draftTitle}
                      onChange={(event) => {
                        const nextTitle = event.currentTarget.value;
                        setTitleDraftState({
                          sheetId: selectedSheet.id,
                          value: nextTitle,
                        });
                        setSheets((current) =>
                          current.map((s) =>
                            s.id === selectedSheet.id
                              ? { ...s, title: nextTitle }
                              : s,
                          ),
                        );
                      }}
                      onBlur={() => void handleTitleCommit()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      className="w-full border-none bg-transparent p-0 text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50"
                      placeholder="Untitled"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatTimestamp(selectedSheet.updatedAt)}</span>
                    </div>
                  </div>
                }
                onSave={async (nextContent) => {
                  try {
                    await saveSheet(selectedSheet.id, {
                      title: draftTitle.trim() || "Untitled",
                      content: nextContent,
                    });
                  } catch (err) {
                    toast.error("Could not save cheat sheet", {
                      description:
                        err instanceof Error ? err.message : undefined,
                      duration: 5000,
                    });
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
            {storageReady ? (
              <>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Write a cheat sheet from scratch — condensing the material
                  yourself is the point.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    startTransition(() => void handleCreate(null))
                  }
                  disabled={isPending}
                >
                  New cheat sheet
                </Button>
              </>
            ) : (
              <p className="max-w-xs text-sm text-muted-foreground">
                Cheat sheet storage is not ready yet. Run the latest database
                migration to start writing.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
