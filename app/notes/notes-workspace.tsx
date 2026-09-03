"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderInput,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AsciiBackground } from "@/components/shell/ascii-background";
import { useAsciiBackgroundEnabled } from "@/components/shell/background-preference";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";
import {
  noteRecordToWorkspaceNote,
  sortWorkspaceNotes,
  type NoteRecord,
  type WorkspaceNote,
} from "@/lib/notes/records";

type WorkspaceClass = {
  id: string;
  runId: string;
  title: string;
  courseCode: string | null;
  noteCount: number;
};

type NotesWorkspaceProps = {
  initialNotes: WorkspaceNote[];
  classes: WorkspaceClass[];
  initialClassId: string | null;
  shouldCreateOnMount: boolean;
  resetHref: string;
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatTimestamp(value: string) {
  return TIMESTAMP_FORMATTER.format(new Date(value));
}

function getRenderableTitle(value: string) {
  return value.trim() || "Untitled";
}

/** Full label used in tooltips and accessible names */
function getClassLabel(item: WorkspaceClass) {
  return item.courseCode ? `${item.courseCode} ${item.title}` : item.title;
}

/**
 * Short label for compact sidebar contexts.
 * Uses the course code when available (e.g. "CS/CE 4337.006").
 * Falls back to an acronym when there is no code.
 */
function getClassShortLabel(item: WorkspaceClass) {
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

const isTempNote = (id: string) => id.startsWith("temp-");

function createTempNote(
  classId: string | null,
  overrides?: Partial<WorkspaceNote>,
): WorkspaceNote {
  const now = new Date().toISOString();
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "Untitled",
    classId,
    sourceType: "manual",
    fileName: null,
    mimeType: null,
    fileSize: null,
    embedding: null,
    createdAt: now,
    updatedAt: now,
    content: { markdown: "", document: { time: Date.now(), blocks: [] } },
    generation: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

type UploadModalProps = {
  onClose: () => void;
  onUploadMd: () => void;
  onGenerate: () => void;
};

function UploadModal({ onClose, onUploadMd, onGenerate }: UploadModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add notes"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Add notes</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onUploadMd}
            className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface-muted/60 px-4 py-3 text-left transition hover:border-border-strong hover:bg-surface-muted"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                Upload .md file
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Import a Markdown document directly
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onGenerate}
            className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface-muted/60 px-4 py-3 text-left transition hover:border-border-strong hover:bg-surface-muted"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                Generate from study material
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Upload slides, PDFs, or images — AI writes the notes
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function NotesWorkspace({
  initialNotes,
  classes,
  initialClassId,
  shouldCreateOnMount,
  resetHref,
}: NotesWorkspaceProps) {
  const router = useRouter();
  const asciiBackgroundEnabled = useAsciiBackgroundEnabled();
  const [notes, setNotes] = useState(() => sortWorkspaceNotes(initialNotes));
  const initialSelectedNote = initialClassId
    ? (initialNotes.find((note) => note.classId === initialClassId) ??
      initialNotes[0] ??
      null)
    : (initialNotes[0] ?? null);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialSelectedNote?.id ?? null,
  );
  const [titleDraftState, setTitleDraftState] = useState(() => ({
    noteId: initialSelectedNote?.id ?? null,
    value: initialSelectedNote?.title ?? "Untitled",
  }));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [isPending, startTransition] = useTransition();

  // Sidebar drag-and-drop state
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  // Sidebar multi-select state
  const [sidebarSelectedIds, setSidebarSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lastSidebarSelectedId, setLastSidebarSelectedId] = useState<
    string | null
  >(null);
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);

  // Sidebar note context menu
  const [noteContextMenu, setNoteContextMenu] = useState<{
    x: number;
    y: number;
    note: WorkspaceNote;
  } | null>(null);

  // Upload modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const hasHandledCreateOnMountRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedIdRef = useRef<string | null>(initialSelectedNote?.id ?? null);

  const classesById = useMemo(
    () => new Map(classes.map((item) => [item.id, item])),
    [classes],
  );
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? notes[0] ?? null,
    [notes, selectedId],
  );
  const recentNotes = useMemo(
    () => sortWorkspaceNotes(notes).slice(0, 8),
    [notes],
  );
  const groupedNotes = useMemo(
    () => [
      ...classes.map((item) => ({
        id: item.id,
        title: getClassLabel(item),
        shortTitle: getClassShortLabel(item),
        classId: item.id as string | null,
        notes: notes.filter((note) => note.classId === item.id),
      })),
      {
        id: "unfiled",
        title: "Unfiled",
        shortTitle: "Unfiled",
        classId: null as string | null,
        notes: notes.filter((note) => !note.classId),
      },
    ],
    [classes, notes],
  );
  const draftTitle =
    selectedNote && titleDraftState.noteId === selectedNote.id
      ? titleDraftState.value
      : (selectedNote?.title ?? "Untitled");
  const fallbackClassId = initialClassId ?? selectedNote?.classId ?? null;

  useEffect(() => {
    selectedIdRef.current = selectedNote?.id ?? null;
  }, [selectedNote?.id]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function readNoteRecord(response: Response) {
    const payload = (await response.json().catch(() => null)) as
      | (NoteRecord & { error?: string })
      | { error?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "The notes request failed.");
    }
    return noteRecordToWorkspaceNote(payload as NoteRecord);
  }

  function mergeNote(nextNote: WorkspaceNote, options?: { keepPosition?: boolean }) {
    setNotes((current) => {
      // Body autosaves would otherwise re-sort by updatedAt and yank the note
      // being edited to the top of the sidebar on every pause in typing.
      if (options?.keepPosition && current.some((n) => n.id === nextNote.id)) {
        return current.map((n) => (n.id === nextNote.id ? nextNote : n));
      }
      return sortWorkspaceNotes([
        nextNote,
        ...current.filter((n) => n.id !== nextNote.id),
      ]);
    });
  }

  function mergeNotes(nextNotes: WorkspaceNote[]) {
    setNotes((current) =>
      sortWorkspaceNotes([
        ...nextNotes,
        ...current.filter((n) => !nextNotes.some((nn) => nn.id === n.id)),
      ]),
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

  function selectNote(note: WorkspaceNote) {
    setSelectedId(note.id);
    setTitleDraftState({ noteId: note.id, value: note.title });
  }

  // -------------------------------------------------------------------------
  // Save (guards temp IDs)
  // -------------------------------------------------------------------------

  async function saveNote(
    noteId: string,
    patch: { title?: string; markdown?: string; classId?: string | null },
  ) {
    if (isTempNote(noteId)) return; // creation pending — skip

    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.markdown !== undefined ? { markdown: patch.markdown } : {}),
        ...(patch.classId !== undefined ? { classId: patch.classId } : {}),
      }),
    });

    const updatedNote = await readNoteRecord(response);
    mergeNote(updatedNote, { keepPosition: patch.markdown !== undefined });
    setTitleDraftState((current) =>
      current.noteId === updatedNote.id
        ? { noteId: updatedNote.id, value: updatedNote.title }
        : current,
    );
  }

  // -------------------------------------------------------------------------
  // Create (optimistic)
  // -------------------------------------------------------------------------

  async function handleCreateNote(classId?: string | null, silent = false) {
    const temp = createTempNote(classId ?? null);

    setNotes((current) => sortWorkspaceNotes([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ noteId: temp.id, value: "Untitled" });

    if (!silent && classId) {
      setCollapsedGroups((current) => {
        const next = new Set(current);
        next.delete(classId);
        return next;
      });
    }

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled",
          classId: classId ?? null,
          markdown: "",
        }),
      });
      const created = await readNoteRecord(response);
      setNotes((current) =>
        sortWorkspaceNotes([
          created,
          ...current.filter((n) => n.id !== temp.id),
        ]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      setTitleDraftState((prev) =>
        prev.noteId === temp.id
          ? { noteId: created.id, value: created.title }
          : prev,
      );
      selectedIdRef.current = created.id;
    } catch (err) {
      setNotes((current) => current.filter((n) => n.id !== temp.id));
      setSelectedId((prev) => (prev === temp.id ? null : prev));
      toast.error("Could not create note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  const createNoteFromCurrentFilter = useEffectEvent((silent: boolean) => {
    startTransition(() => void handleCreateNote(fallbackClassId, silent));
  });

  useEffect(() => {
    if (!shouldCreateOnMount || hasHandledCreateOnMountRef.current) return;
    hasHandledCreateOnMountRef.current = true;
    createNoteFromCurrentFilter(true);
    router.replace(resetHref);
  }, [resetHref, router, shouldCreateOnMount]);

  // -------------------------------------------------------------------------
  // Delete (optimistic, no dialog)
  // -------------------------------------------------------------------------

  async function handleDeleteNote() {
    if (!selectedNote || isTempNote(selectedNote.id)) return;

    const noteToDelete = selectedNote;
    const nextNote = notes.find((n) => n.id !== noteToDelete.id) ?? null;

    setNotes((current) => current.filter((n) => n.id !== noteToDelete.id));
    setSelectedId(nextNote?.id ?? null);

    try {
      const response = await fetch(`/api/notes/${noteToDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Could not delete the note.");
      }
    } catch (err) {
      setNotes((current) => sortWorkspaceNotes([noteToDelete, ...current]));
      setSelectedId(noteToDelete.id);
      toast.error("Could not delete note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Duplicate (optimistic)
  // -------------------------------------------------------------------------

  async function handleDuplicateNote() {
    if (!selectedNote || isTempNote(selectedNote.id)) return;

    const source = selectedNote;
    const temp = createTempNote(source.classId, {
      title: `${source.title} (copy)`,
      content: source.content,
    });

    setNotes((current) => sortWorkspaceNotes([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ noteId: temp.id, value: temp.title });

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: temp.title,
          classId: temp.classId,
          markdown: source.content.markdown,
        }),
      });
      const created = await readNoteRecord(response);
      setNotes((current) =>
        sortWorkspaceNotes([
          created,
          ...current.filter((n) => n.id !== temp.id),
        ]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      setTitleDraftState((prev) =>
        prev.noteId === temp.id
          ? { noteId: created.id, value: created.title }
          : prev,
      );
      selectedIdRef.current = created.id;
    } catch (err) {
      setNotes((current) => current.filter((n) => n.id !== temp.id));
      setSelectedId(source.id);
      toast.error("Could not duplicate note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  // -------------------------------------------------------------------------
  // File upload / import
  // -------------------------------------------------------------------------

  async function handleGenerateFromFile(file: File, classId?: string | null) {
    const toastId = toast.loading(`Parsing ${file.name}…`, {
      description: "This can take up to a minute for large files.",
      duration: Infinity,
    });

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set(
        "title",
        file.name.replace(/\.[^.]+$/, "") || "Uploaded Note",
      );
      if (classId) formData.set("classId", classId);

      toast.loading("Generating notes with AI…", {
        id: toastId,
        description: undefined,
      });

      const response = await fetch("/api/notes/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        notes?: NoteRecord[];
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not generate notes from the uploaded file.",
        );
      }

      const created = (payload?.notes ?? []).map((r) =>
        noteRecordToWorkspaceNote(r),
      );
      if (created.length === 0)
        throw new Error("No notes returned from generation pipeline.");

      mergeNotes(created);
      setSelectedId(created[0].id);

      toast.success(
        `Generated ${created.length} note${created.length === 1 ? "" : "s"}`,
        { id: toastId, description: file.name, duration: 4000 },
      );
    } catch (err) {
      toast.error("Generation failed", {
        id: toastId,
        description:
          err instanceof Error ? err.message : "Could not generate notes.",
        duration: 6000,
      });
      throw err;
    }
  }

  async function handleImportMdFile(file: File, classId?: string | null) {
    const toastId = toast.loading(`Importing ${file.name}…`, {
      duration: Infinity,
    });

    try {
      const text = await file.text();
      const title = file.name.replace(/\.md$/i, "").trim() || "Imported Note";

      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          classId: classId ?? null,
          markdown: text,
        }),
      });

      const created = await readNoteRecord(response);
      mergeNote(created);
      setSelectedId(created.id);
      setTitleDraftState({ noteId: created.id, value: created.title });
      toast.success("Note imported", {
        id: toastId,
        description: title,
        duration: 3000,
      });
    } catch (err) {
      toast.error("Import failed", {
        id: toastId,
        description:
          err instanceof Error ? err.message : "Could not import the file.",
        duration: 6000,
      });
      throw err;
    }
  }

  async function handleTitleCommit() {
    if (!selectedNote || isTempNote(selectedNote.id)) return;

    const nextTitle = draftTitle.trim() || "Untitled";
    if (nextTitle === getRenderableTitle(selectedNote.title)) {
      if (selectedNote.title !== nextTitle)
        mergeNote({ ...selectedNote, title: nextTitle });
      return;
    }

    try {
      await saveNote(selectedNote.id, { title: nextTitle });
    } catch (saveError) {
      toast.error("Could not save title", {
        description: saveError instanceof Error ? saveError.message : undefined,
        duration: 5000,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Sidebar drag-and-drop: move note to a different class
  // -------------------------------------------------------------------------

  function handleNoteDrop(groupClassId: string | null, noteId: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note || note.classId === groupClassId || isTempNote(noteId)) return;

    setNotes((current) =>
      current.map((n) =>
        n.id === noteId ? { ...n, classId: groupClassId } : n,
      ),
    );
    startTransition(
      () =>
        void saveNote(noteId, { classId: groupClassId }).catch((err) => {
          toast.error("Could not move note", {
            description: err instanceof Error ? err.message : undefined,
            duration: 5000,
          });
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Sidebar multi-select
  // -------------------------------------------------------------------------

  function toggleSidebarSelect(noteId: string) {
    setSidebarSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
    setLastSidebarSelectedId(noteId);
    setIsBulkMoveOpen(false);
  }

  function rangeSidebarSelect(fromId: string, toId: string) {
    const sorted = sortWorkspaceNotes(notes);
    const fromIdx = sorted.findIndex((n) => n.id === fromId);
    const toIdx = sorted.findIndex((n) => n.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    setSidebarSelectedIds(
      new Set(sorted.slice(start, end + 1).map((n) => n.id)),
    );
    setLastSidebarSelectedId(toId);
  }

  function clearSidebarSelect() {
    setSidebarSelectedIds(new Set());
    setLastSidebarSelectedId(null);
    setIsBulkMoveOpen(false);
  }

  async function handleBulkDelete() {
    if (sidebarSelectedIds.size === 0) return;
    const ids = [...sidebarSelectedIds];

    setNotes((current) => current.filter((n) => !ids.includes(n.id)));
    if (selectedNote && ids.includes(selectedNote.id)) {
      setSelectedId(notes.find((n) => !ids.includes(n.id))?.id ?? null);
    }
    clearSidebarSelect();

    await Promise.allSettled(
      ids.map(
        (id) =>
          !isTempNote(id) && fetch(`/api/notes/${id}`, { method: "DELETE" }),
      ),
    );
    // On partial failure we could restore, but for now just log
  }

  async function handleBulkDuplicate() {
    if (sidebarSelectedIds.size === 0) return;
    const sources = notes.filter(
      (n) => sidebarSelectedIds.has(n.id) && !isTempNote(n.id),
    );
    if (sources.length === 0) return;

    const temps = sources.map((source) =>
      createTempNote(source.classId, {
        title: `${source.title} (copy)`,
        content: source.content,
      }),
    );

    setNotes((current) => sortWorkspaceNotes([...temps, ...current]));
    clearSidebarSelect();

    await Promise.all(
      sources.map(async (source, i) => {
        const temp = temps[i]!;
        try {
          const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: temp.title,
              classId: temp.classId,
              markdown: source.content.markdown,
            }),
          });
          const created = await readNoteRecord(response);
          setNotes((current) =>
            sortWorkspaceNotes([
              created,
              ...current.filter((n) => n.id !== temp.id),
            ]),
          );
        } catch {
          setNotes((current) => current.filter((n) => n.id !== temp.id));
        }
      }),
    );
  }

  function handleBulkMove(targetClassId: string | null) {
    if (sidebarSelectedIds.size === 0) return;
    const ids = [...sidebarSelectedIds];

    setNotes((current) =>
      current.map((n) =>
        ids.includes(n.id) ? { ...n, classId: targetClassId } : n,
      ),
    );
    clearSidebarSelect();

    for (const id of ids) {
      if (!isTempNote(id)) {
        void saveNote(id, { classId: targetClassId }).catch(console.error);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Note context menu actions (single-note, independent of selection)
  // -------------------------------------------------------------------------

  async function handleContextMenuDuplicate(source: WorkspaceNote) {
    setNoteContextMenu(null);
    const temp = createTempNote(source.classId, {
      title: `${source.title} (copy)`,
      content: source.content,
    });
    setNotes((current) => sortWorkspaceNotes([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ noteId: temp.id, value: temp.title });
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: temp.title,
          classId: temp.classId,
          markdown: source.content.markdown,
        }),
      });
      const created = await readNoteRecord(response);
      setNotes((current) =>
        sortWorkspaceNotes([
          created,
          ...current.filter((n) => n.id !== temp.id),
        ]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      setTitleDraftState((prev) =>
        prev.noteId === temp.id
          ? { noteId: created.id, value: created.title }
          : prev,
      );
      selectedIdRef.current = created.id;
    } catch (err) {
      setNotes((current) => current.filter((n) => n.id !== temp.id));
      toast.error("Could not duplicate note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleContextMenuDelete(target: WorkspaceNote) {
    setNoteContextMenu(null);
    if (isTempNote(target.id)) return;
    const nextNote = notes.find((n) => n.id !== target.id) ?? null;
    setNotes((current) => current.filter((n) => n.id !== target.id));
    if (selectedNote?.id === target.id) setSelectedId(nextNote?.id ?? null);
    try {
      const response = await fetch(`/api/notes/${target.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Could not delete the note.");
      }
    } catch (err) {
      setNotes((current) => sortWorkspaceNotes([target, ...current]));
      toast.error("Could not delete note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Note item renderer
  // -------------------------------------------------------------------------

  const renderNoteItem = (
    note: WorkspaceNote,
    options?: { compact?: boolean },
  ) => {
    const isOpen = note.id === selectedNote?.id;
    const isSidebarSelected = sidebarSelectedIds.has(note.id);
    const isTemp = isTempNote(note.id);
    const linkedClass = note.classId
      ? (classesById.get(note.classId) ?? null)
      : null;
    const hasSelection = sidebarSelectedIds.size > 0;

    return (
      <div
        key={note.id}
        draggable={!isTemp}
        onDragStart={(e) => {
          setDraggedNoteId(note.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDraggedNoteId(null);
          setDragOverGroupId(null);
        }}
        onContextMenu={(e) => {
          if (isTemp) return;
          e.preventDefault();
          const x = Math.min(e.clientX, window.innerWidth - 180);
          const y = Math.min(e.clientY, window.innerHeight - 200);
          setNoteContextMenu({ x, y, note });
        }}
        className={cx(
          "group relative flex items-center rounded-md transition",
          isSidebarSelected && "bg-accent-soft",
          draggedNoteId &&
            (draggedNoteId === note.id ||
              (sidebarSelectedIds.has(draggedNoteId) &&
                sidebarSelectedIds.has(note.id))) &&
            "opacity-40",
        )}
      >
        {/* Selection checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSidebarSelect(note.id);
          }}
          className={cx(
            "flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground",
            hasSelection || isSidebarSelected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          )}
          aria-label={isSidebarSelected ? "Deselect note" : "Select note"}
          tabIndex={-1}
        >
          {isSidebarSelected ? (
            <CheckSquare
              className="h-3.5 w-3.5 text-accent"
              aria-hidden="true"
            />
          ) : (
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        {/* Main tap area */}
        <button
          type="button"
          disabled={isTemp}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              toggleSidebarSelect(note.id);
              return;
            }
            if (e.shiftKey && lastSidebarSelectedId) {
              rangeSidebarSelect(lastSidebarSelectedId, note.id);
              return;
            }
            clearSidebarSelect();
            selectNote(note);
          }}
          className={cx(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
            isOpen && !isSidebarSelected
              ? "bg-surface-elevated text-foreground"
              : isSidebarSelected
                ? "text-accent"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            isTemp && "animate-pulse opacity-60",
          )}
        >
          <FileText
            className="h-4 w-4 shrink-0 opacity-70"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate font-medium">
            {getRenderableTitle(note.title)}
          </span>
          {options?.compact ? null : (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatTimestamp(note.updatedAt)}
            </span>
          )}
          {options?.compact && linkedClass ? (
            <span
              title={getClassLabel(linkedClass)}
              className="max-w-24 shrink-0 truncate text-[11px] text-muted-foreground"
            >
              {getClassShortLabel(linkedClass)}
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full min-h-0 overflow-hidden bg-surface">
      {/* Hidden file input — AI generation */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          startTransition(() => {
            void handleGenerateFromFile(
              file,
              selectedNote?.classId ?? fallbackClassId,
            ).catch(() => {
              /* toast already shown inside handler */
            });
          });
        }}
      />

      {/* Hidden file input — .md import */}
      <input
        ref={mdFileInputRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          startTransition(() => {
            void handleImportMdFile(
              file,
              selectedNote?.classId ?? fallbackClassId,
            ).catch(() => {
              /* toast already shown inside handler */
            });
          });
        }}
      />

      {/* Upload / Generate modal */}
      {isUploadModalOpen ? (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          onUploadMd={() => {
            setIsUploadModalOpen(false);
            mdFileInputRef.current?.click();
          }}
          onGenerate={() => {
            setIsUploadModalOpen(false);
            fileInputRef.current?.click();
          }}
        />
      ) : null}

      <div className="grid h-full min-h-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* Sidebar                                                           */}
        {/* ---------------------------------------------------------------- */}
        <aside className="flex h-full min-h-0 flex-col border-b border-border bg-surface-muted/70 lg:border-b-0 lg:border-r">
          {/* Toolbar */}
          <div className="flex h-12 items-center gap-2 border-b border-border px-3">
            <button
              type="button"
              onClick={() =>
                startTransition(() => void handleCreateNote(fallbackClassId))
              }
              disabled={isPending}
              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">New page</span>
            </button>
            {/* <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              disabled={isPending}
              title="Import or generate notes"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-60"
              aria-label="Import or generate notes"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
            </button> */}
          </div>

          {/* Note list */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
            {recentNotes.length > 0 ? (
              <section className="mb-5">
                <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  Recents
                </div>
                <div className="space-y-0.5">
                  {recentNotes.map((note) =>
                    renderNoteItem(note, { compact: true }),
                  )}
                </div>
              </section>
            ) : null}

            <section className="space-y-1">
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                Private
              </div>
              {groupedNotes.map((group) => {
                const isCollapsed = collapsedGroups.has(group.id);
                const isDragTarget =
                  dragOverGroupId === group.id && draggedNoteId !== null;
                const draggedNote = draggedNoteId
                  ? notes.find((n) => n.id === draggedNoteId)
                  : null;
                // When dragging a selected note, at least one selected note must
                // differ from this group's class for the drop to be meaningful.
                const canDrop =
                  draggedNote &&
                  (() => {
                    const id = draggedNoteId!;
                    if (
                      sidebarSelectedIds.has(id) &&
                      sidebarSelectedIds.size > 1
                    ) {
                      return notes.some(
                        (n) =>
                          sidebarSelectedIds.has(n.id) &&
                          n.classId !== group.classId,
                      );
                    }
                    return draggedNote.classId !== group.classId;
                  })();

                return (
                  <div
                    key={group.id}
                    onDragOver={(e) => {
                      if (!canDrop) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverGroupId(group.id);
                    }}
                    onDragEnter={(e) => {
                      if (!canDrop) return;
                      e.preventDefault();
                      setDragOverGroupId(group.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverGroupId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverGroupId(null);
                      if (draggedNoteId && canDrop) {
                        // If the dragged note is part of the sidebar selection,
                        // move all selected notes. Otherwise just move the one.
                        if (
                          sidebarSelectedIds.has(draggedNoteId) &&
                          sidebarSelectedIds.size > 1
                        ) {
                          handleBulkMove(group.classId);
                        } else {
                          handleNoteDrop(group.classId, draggedNoteId);
                        }
                      }
                      setDraggedNoteId(null);
                    }}
                    className={cx(
                      "rounded-lg transition-colors",
                      isDragTarget && canDrop
                        ? "bg-accent-soft ring-1 ring-accent/30"
                        : "",
                    )}
                  >
                    <div className="group flex items-center gap-1 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.title}`}
                      >
                        {isCollapsed ? (
                          <ChevronRight
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
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
                          {group.notes.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(
                            () => void handleCreateNote(group.classId),
                          )
                        }
                        disabled={isPending}
                        className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 hover:bg-surface-elevated group-hover:opacity-100 disabled:opacity-40"
                        aria-label={`New note in ${group.title}`}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    {!isCollapsed && group.notes.length > 0 ? (
                      <div className="ml-3 space-y-0.5 border-l border-border/70 pl-1">
                        {group.notes.map((note) => renderNoteItem(note))}
                      </div>
                    ) : null}

                    {isDragTarget && canDrop ? (
                      <div className="mx-2 mb-1 rounded-md border border-dashed border-accent/50 bg-accent/5 px-2 py-1.5 text-center text-xs text-accent">
                        Drop to move here
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          </div>

          {/* Bulk selection action bar */}
          {sidebarSelectedIds.size > 0 ? (
            <div className="border-t border-border p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-medium text-foreground">
                  {sidebarSelectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={clearSidebarSelect}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>

              <div className="space-y-0.5">
                {/* Move to */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsBulkMoveOpen((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <FolderInput
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    Move to…
                    <ChevronDown
                      className={cx(
                        "ml-auto h-3 w-3 transition-transform",
                        isBulkMoveOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isBulkMoveOpen ? (
                    <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
                      <button
                        type="button"
                        onClick={() => handleBulkMove(null)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                      >
                        <Folder
                          className="h-3.5 w-3.5 shrink-0 opacity-60"
                          aria-hidden="true"
                        />
                        Unfiled
                      </button>
                      {classes.map((cls) => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => handleBulkMove(cls.id)}
                          title={getClassLabel(cls)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        >
                          <Folder
                            className="h-3.5 w-3.5 shrink-0 opacity-60"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {getClassShortLabel(cls)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => void handleBulkDuplicate()}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDelete()}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* Editor area                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="notes-app-background relative h-full min-h-0 overflow-hidden bg-background">
          {asciiBackgroundEnabled ? (
            <AsciiBackground className="notes-app-background__ascii" />
          ) : null}
          {selectedNote ? (
            <div className="relative z-10 flex h-full min-h-0 flex-col">
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
                    onClick={() => setIsUploadModalOpen(true)}
                    disabled={isPending}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                    aria-label="Import or generate notes"
                    title="Import or generate notes"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicateNote()}
                    disabled={isPending || isTempNote(selectedNote.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                    aria-label="Duplicate note"
                    title="Duplicate note"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteNote()}
                    disabled={isPending || isTempNote(selectedNote.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-60"
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                <div className="mx-auto w-full px-4 pt-7 md:px-10 md:pt-10">
                  <input
                    data-note-selection-region
                    value={draftTitle}
                    onChange={(event) => {
                      const nextTitle = event.currentTarget.value;
                      setTitleDraftState({
                        noteId: selectedNote.id,
                        value: nextTitle,
                      });
                      setNotes((current) =>
                        current.map((n) =>
                          n.id === selectedNote.id
                            ? { ...n, title: nextTitle }
                            : n,
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
                    <span>{formatTimestamp(selectedNote.updatedAt)}</span>
                    {selectedNote.fileName ? (
                      <span className="truncate">{selectedNote.fileName}</span>
                    ) : null}
                  </div>
                </div>

                {/* SEAM: the note editor was removed and is being rebuilt.
                    Mount the new editor here. It should receive
                    `selectedNote.content.document` and persist through
                    `saveNote(selectedNote.id, { title, content })`. Until
                    then the stored markdown is shown read-only so note
                    content stays reachable. */}
                <div className="mx-auto w-full px-4 pb-10 pt-8 md:px-10">
                  <p className="mb-3 text-sm text-muted-foreground">
                    The note editor is being rebuilt. Content is read-only for now.
                  </p>
                  {selectedNote.content.markdown.trim() ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-xl)] border border-border bg-surface-muted p-4 font-mono text-sm text-foreground">
                      {selectedNote.content.markdown}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">This note is empty.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex h-full min-h-0 items-center justify-center p-6">
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    startTransition(
                      () => void handleCreateNote(fallbackClassId),
                    )
                  }
                  disabled={isPending}
                >
                  New page
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUploadModalOpen(true)}
                  disabled={isPending}
                >
                  Import
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Sidebar note context menu */}
      {noteContextMenu && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setNoteContextMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-lg"
            style={{ left: noteContextMenu.x, top: noteContextMenu.y }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface"
              onClick={() => {
                selectNote(noteContextMenu.note);
                setNoteContextMenu(null);
              }}
            >
              Open
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface"
              onClick={() =>
                void handleContextMenuDuplicate(noteContextMenu.note)
              }
            >
              Duplicate
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-surface"
              onClick={() => void handleContextMenuDelete(noteContextMenu.note)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
