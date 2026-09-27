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
  Copy,
  Download,
  FileText,
  Folder,
  FolderInput,
  Plus,
  Search,
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
  formatBytes,
  MAX_NOTE_MARKDOWN_CHARS,
  MAX_UPLOAD_FILE_BYTES,
  NOTE_TOO_LARGE_MESSAGE,
} from "@/lib/notes/limits";
import {
  noteRecordToWorkspaceNote,
  isTempNoteId,
  sortWorkspaceNotes,
  type NoteRecord,
  type WorkspaceNote,
} from "@/lib/notes/records";
import Link from "next/link";
import { NoteEditor, type NoteEditorHandle } from "@/components/note-editor/note-editor";
import { searchNotes } from "@/lib/notes/search";
import { PermanentSaveError } from "@/components/note-editor/use-autosave";

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
  initialClassId: string;
  shouldCreateOnMount: boolean;
  resetHref: string;
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * Rendered on the server and hydrated on the client, whose timezone can put
 * the same instant on a different calendar day. The spans that show this
 * carry `suppressHydrationWarning`, and React patches the text on hydration
 * so the user always sees their local date.
 */
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

const isTempNote = isTempNoteId;

function createTempNote(
  /** Required: a note has to have a home before it exists. */
  classId: string,
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
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  // The editor's text runs ahead of `notes`, which only catches up when an
  // autosave response lands. Export and duplicate read from here so neither
  // silently drops the last few seconds of typing.
  const noteEditorRef = useRef<NoteEditorHandle | null>(null);
  const [trashedNotes, setTrashedNotes] = useState<WorkspaceNote[] | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Sidebar drag-and-drop state
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
  // The page already ships every note's markdown, so searching is a filter over
  // data in hand: no endpoint, no index, no round-trip.
  const searchResults = useMemo(
    () =>
      searchNotes(
        notes.map((n) => ({ id: n.id, title: n.title, markdown: n.content.markdown, note: n })),
        searchQuery,
      ),
    [notes, searchQuery],
  );
  const isSearching = searchQuery.trim().length > 0;

  const draftTitle =
    selectedNote && titleDraftState.noteId === selectedNote.id
      ? titleDraftState.value
      : (selectedNote?.title ?? "Untitled");
  // The workspace is always scoped to one class, chosen at `/notes` and carried
  // in the URL. Creation, upload and import all use it. There is deliberately
  // no fallback: guessing a class filed work into an arbitrary course without
  // telling anyone, which is worse than refusing.
  const activeClass = classes.find((item) => item.id === initialClassId) ?? null;
  const fallbackClassId = initialClassId;

  useEffect(() => {
    selectedIdRef.current = selectedNote?.id ?? null;
  }, [selectedNote?.id]);

  // Note creation resolves asynchronously and must see the latest draft, not
  // the one captured when the request started.
  const titleDraftRef = useRef(titleDraftState);
  useEffect(() => {
    titleDraftRef.current = titleDraftState;
  }, [titleDraftState]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function readNoteRecord(response: Response) {
    const payload = (await response.json().catch(() => null)) as
      | (NoteRecord & { error?: string })
      | { error?: string }
      | null;
    if (!response.ok) {
      const message = payload?.error || "The notes request failed.";
      // 404/403 mean the note is gone or not ours: retrying can never work.
      throw response.status === 404 || response.status === 403
        ? new PermanentSaveError(message)
        : new Error(message);
    }
    return noteRecordToWorkspaceNote(payload as NoteRecord);
  }

  function mergeNote(
    nextNote: WorkspaceNote,
    options?: { keepPosition?: boolean; keepTitle?: boolean },
  ) {
    setNotes((current) => {
      const existing = current.find((n) => n.id === nextNote.id);
      const merged =
        options?.keepTitle && existing ? { ...nextNote, title: existing.title } : nextNote;
      // Body autosaves would otherwise re-sort by updatedAt and yank the note
      // being edited to the top of the sidebar on every pause in typing.
      if (options?.keepPosition && existing) {
        return current.map((n) => (n.id === merged.id ? merged : n));
      }
      return sortWorkspaceNotes([
        merged,
        ...current.filter((n) => n.id !== merged.id),
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
    if (patch.title === undefined) {
      // A body save must not clobber the title: the user may be typing one,
      // or its own save may still be in flight, and the server's copy is
      // stale until that returns.
      mergeNote(updatedNote, { keepPosition: patch.markdown !== undefined, keepTitle: true });
      return;
    }
    mergeNote(updatedNote);
    setTitleDraftState((current) =>
      current.noteId === updatedNote.id
        ? { noteId: updatedNote.id, value: updatedNote.title }
        : current,
    );
  }

  // -------------------------------------------------------------------------
  // Create (optimistic)
  // -------------------------------------------------------------------------

  function handleCreateNote(classId?: string | null) {
    const targetClassId = classId ?? fallbackClassId;
    if (!targetClassId) {
      toast.error("Create a class first", {
        description: "Notes live inside a class, so there needs to be one to put this in.",
        duration: 6000,
      });
      return;
    }

    const temp = createTempNote(targetClassId);

    // Urgent on purpose: the workspace must be showing the new note before
    // the next keystroke. Inside the transition these updates could sit
    // behind a keystroke, and a title typed right after "New page" was
    // committed to whichever note was selected before.
    setNotes((current) => sortWorkspaceNotes([temp, ...current]));
    setSelectedId(temp.id);
    setTitleDraftState({ noteId: temp.id, value: "Untitled" });

    // The request itself is the transition (it drives `isPending`).
    startTransition(() => createNoteOnServer(temp, targetClassId));
  }

  async function createNoteOnServer(temp: WorkspaceNote, classId: string) {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled",
          classId,
          markdown: "",
        }),
      });
      const created = await readNoteRecord(response);
      // The user may already have typed a title while the request was in
      // flight; keep it rather than resetting to the server's "Untitled".
      const draft = titleDraftRef.current;
      const typedTitle = draft.noteId === temp.id ? draft.value.trim() : "";
      const keptTitle = typedTitle && typedTitle !== created.title ? typedTitle : created.title;
      setNotes((current) =>
        sortWorkspaceNotes([
          { ...created, title: keptTitle },
          ...current.filter((n) => n.id !== temp.id),
        ]),
      );
      setSelectedId((prev) => (prev === temp.id ? created.id : prev));
      // Retarget the draft without touching its text: a functional update
      // sees the live value, so a title being typed right now is not reset
      // to the server's "Untitled" mid-keystroke.
      setTitleDraftState((prev) =>
        prev.noteId === temp.id ? { noteId: created.id, value: prev.value } : prev,
      );
      selectedIdRef.current = created.id;
      if (keptTitle !== created.title) {
        try {
          await saveNote(created.id, { title: keptTitle });
        } catch (titleError) {
          toast.error("Could not save title", {
            description: titleError instanceof Error ? titleError.message : undefined,
            duration: 5000,
          });
        }
      }
    } catch (err) {
      setNotes((current) => current.filter((n) => n.id !== temp.id));
      setSelectedId((prev) => (prev === temp.id ? null : prev));
      toast.error("Could not create note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  const createNoteFromCurrentFilter = useEffectEvent(() => {
    handleCreateNote(fallbackClassId);
  });

  useEffect(() => {
    if (!shouldCreateOnMount || hasHandledCreateOnMountRef.current) return;
    hasHandledCreateOnMountRef.current = true;
    createNoteFromCurrentFilter();
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
      setTrashedNotes(null); // reload next time the trash is opened
      toast.success("Moved to trash", {
        description: "Restore it from the trash at the bottom of the sidebar.",
        duration: 5000,
      });
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

  /**
   * A note's text as it stands now.
   *
   * `notes` only catches up when an autosave response lands, so reading it
   * directly meant duplicating or exporting within a second of typing lost the
   * last paragraph. The editor knows the live value for whichever note is
   * open; any other note is only ever as current as its last save.
   */
  async function loadTrash() {
    try {
      const response = await fetch("/api/notes?trash=1");
      const payload = (await response.json().catch(() => null)) as
        | (NoteRecord & { error?: string })[]
        | { error?: string }
        | null;
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string })?.error || "Could not load the trash.");
      }
      setTrashedNotes(payload.map((record) => noteRecordToWorkspaceNote(record)));
    } catch (err) {
      setTrashedNotes([]);
      toast.error("Could not load the trash", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleRestoreNote(target: WorkspaceNote, classId: string) {
    try {
      const response = await fetch(`/api/notes/${target.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId }),
      });
      const restored = await readNoteRecord(response);
      setTrashedNotes((current) => (current ?? []).filter((n) => n.id !== target.id));
      mergeNote(restored);
      setSelectedId(restored.id);
      toast.success("Note restored");
    } catch (err) {
      toast.error("Could not restore note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  async function handleDeleteForever(target: WorkspaceNote) {
    if (!window.confirm(`Permanently delete "${getRenderableTitle(target.title)}"? This cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/notes/${target.id}?permanent=1`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not delete the note.");
      }
      setTrashedNotes((current) => (current ?? []).filter((n) => n.id !== target.id));
    } catch (err) {
      toast.error("Could not delete note", {
        description: err instanceof Error ? err.message : undefined,
        duration: 5000,
      });
    }
  }

  function currentMarkdownOf(target: WorkspaceNote) {
    return target.id === selectedNote?.id
      ? (noteEditorRef.current?.getMarkdown() ?? target.content.markdown)
      : target.content.markdown;
  }

  async function handleDuplicateNote() {
    if (!selectedNote || isTempNote(selectedNote.id)) return;

    const source = selectedNote;
    const temp = createTempNote(source.classId ?? fallbackClassId ?? "", {
      title: `${source.title} (copy)`,
      content: { ...source.content, markdown: currentMarkdownOf(source) },
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
          markdown: currentMarkdownOf(source),
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
    const targetClassId = classId ?? fallbackClassId;
    if (!targetClassId) {
      toast.error("Choose a class first", {
        description: "Generated notes are filed under a class.",
        duration: 6000,
      });
      return;
    }
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      // Refused here rather than after the upload: the answer cannot change, so
      // sending 10+ MB first only makes the user wait for it.
      toast.error("That file is too large", {
        description: `${formatBytes(file.size)} — the maximum is ${formatBytes(MAX_UPLOAD_FILE_BYTES)}.`,
        duration: 6000,
      });
      return;
    }
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
      formData.set("classId", targetClassId);

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
    const targetClassId = classId ?? fallbackClassId;
    if (!targetClassId) {
      toast.error("Choose a class first", {
        description: "Imported notes are filed under a class.",
        duration: 6000,
      });
      return;
    }
    const toastId = toast.loading(`Importing ${file.name}…`, {
      duration: Infinity,
    });

    try {
      const text = await file.text();
      if (text.length > MAX_NOTE_MARKDOWN_CHARS) {
        toast.error("That file is too long to import", {
          id: toastId,
          description: NOTE_TOO_LARGE_MESSAGE,
          duration: 6000,
        });
        return;
      }
      const title = file.name.replace(/\.md$/i, "").trim() || "Imported Note";

      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          classId: targetClassId,
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

  /**
   * Download the note as a .md file.
   *
   * Markdown is the canonical format, so this is the file itself rather than
   * a conversion: what comes out is exactly what is stored.
   */
  function handleExportNote() {
    if (!selectedNote) return;

    const title = getRenderableTitle(draftTitle).trim() || "note";
    const safeName = title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "note";
    const markdown = noteEditorRef.current?.getMarkdown() ?? selectedNote.content.markdown;

    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    // A note whose creation is still in flight cannot be deleted server-side,
    // and removing it locally would only have it reappear when the POST
    // resolves. Single-note delete already refuses these.
    const ids = [...sidebarSelectedIds].filter((id) => !isTempNote(id));
    if (ids.length === 0) {
      clearSidebarSelect();
      return;
    }

    const removed = notes.filter((n) => ids.includes(n.id));
    setNotes((current) => current.filter((n) => !ids.includes(n.id)));
    if (selectedNote && ids.includes(selectedNote.id)) {
      setSelectedId(notes.find((n) => !ids.includes(n.id))?.id ?? null);
    }
    clearSidebarSelect();
    setTrashedNotes(null); // reload next time the trash is opened

    const toastId = toast.loading(
      `Deleting ${ids.length} note${ids.length === 1 ? "" : "s"}...`,
      { duration: Infinity },
    );

    // `fetch` resolves on 4xx/5xx, so the status has to be checked explicitly
    // or a failed delete looks identical to a successful one.
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
          return response.ok ? null : id;
        } catch {
          return id;
        }
      }),
    );

    const failed = results.filter((id): id is string => id !== null);
    if (failed.length === 0) {
      toast.success(`Deleted ${ids.length} note${ids.length === 1 ? "" : "s"}`, { id: toastId });
      return;
    }

    // Put back exactly the ones that did not delete.
    const restored = removed.filter((n) => failed.includes(n.id));
    setNotes((current) => sortWorkspaceNotes([...restored, ...current]));
    toast.error(`Could not delete ${failed.length} of ${ids.length} notes`, {
      id: toastId,
      description: "They have been restored to the list.",
      duration: 6000,
    });
  }

  async function handleBulkDuplicate() {
    if (sidebarSelectedIds.size === 0) return;
    const sources = notes.filter(
      (n) => sidebarSelectedIds.has(n.id) && !isTempNote(n.id),
    );
    if (sources.length === 0) return;

    const temps = sources.map((source) =>
      createTempNote(source.classId ?? fallbackClassId ?? "", {
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
              markdown: currentMarkdownOf(source),
            }),
          });
          const created = await readNoteRecord(response);
          setNotes((current) =>
            sortWorkspaceNotes([
              created,
              ...current.filter((n) => n.id !== temp.id),
            ]),
          );
        } catch (error) {
          setNotes((current) => current.filter((n) => n.id !== temp.id));
          toast.error(`Could not duplicate "${source.title}"`, {
            description: error instanceof Error ? error.message : undefined,
            duration: 5000,
          });
        }
      }),
    );
  }

  async function handleBulkMove(targetClassId: string) {
    if (sidebarSelectedIds.size === 0) return;
    const ids = [...sidebarSelectedIds].filter((id) => !isTempNote(id));
    if (ids.length === 0) {
      clearSidebarSelect();
      return;
    }

    // Remember where each note was so a failure can put it back.
    const previousClassIds = new Map(
      notes.filter((n) => ids.includes(n.id)).map((n) => [n.id, n.classId]),
    );

    setNotes((current) =>
      current.map((n) =>
        ids.includes(n.id) ? { ...n, classId: targetClassId } : n,
      ),
    );
    clearSidebarSelect();

    const failed = (
      await Promise.all(
        ids.map(async (id) => {
          try {
            await saveNote(id, { classId: targetClassId });
            return null;
          } catch {
            return id;
          }
        }),
      )
    ).filter((id): id is string => id !== null);

    if (failed.length === 0) {
      return;
    }

    setNotes((current) =>
      current.map((n) =>
        failed.includes(n.id) ? { ...n, classId: previousClassIds.get(n.id) ?? null } : n,
      ),
    );
    toast.error(`Could not move ${failed.length} of ${ids.length} notes`, {
      description: "They have been returned to their previous class.",
      duration: 6000,
    });
  }

  // -------------------------------------------------------------------------
  // Note context menu actions (single-note, independent of selection)
  // -------------------------------------------------------------------------

  async function handleContextMenuDuplicate(source: WorkspaceNote) {
    setNoteContextMenu(null);
    const temp = createTempNote(source.classId ?? fallbackClassId ?? "", {
      title: `${source.title} (copy)`,
      content: { ...source.content, markdown: currentMarkdownOf(source) },
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
          markdown: currentMarkdownOf(source),
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
            {getRenderableTitle(titleDraftState.noteId === note.id ? titleDraftState.value : note.title)}
          </span>
          {options?.compact ? null : (
            <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
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
        accept=".pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
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
              onClick={() => handleCreateNote(fallbackClassId)}
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

          {/* Which class these notes belong to, and the way back out */}
          <Link
            href="/notes"
            className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground transition hover:bg-surface hover:text-foreground"
            title="Choose a different class"
          >
            <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {activeClass ? getClassLabel(activeClass) : "Notes"}
            </span>
            <span className="shrink-0">Change</span>
          </Link>

          {/* Search */}
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchQuery("");
                }}
                placeholder="Search notes"
                aria-label="Search notes"
                className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border-strong"
              />
            </div>
          </div>

          {/* Note list */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
            {isSearching ? (
              <section className="space-y-1">
                <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {searchResults.length === 0
                    ? "No matches"
                    : `${searchResults.length} match${searchResults.length === 1 ? "" : "es"}`}
                </div>
                <div className="space-y-0.5">
                  {searchResults.map((match) => (
                    <button
                      key={match.note.id}
                      type="button"
                      onClick={() => setSelectedId(match.note.id)}
                      className={cx(
                        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition",
                        selectedNote?.id === match.note.id
                          ? "bg-surface text-foreground"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <span className="truncate text-sm font-medium text-foreground">
                        {getRenderableTitle(match.note.title)}
                      </span>
                      {match.snippet ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {match.snippetMatch ? (
                            <>
                              {match.snippet.slice(0, match.snippetMatch.start)}
                              <mark className="rounded-[0.2em] bg-accent-soft px-0.5 text-foreground">
                                {match.snippet.slice(
                                  match.snippetMatch.start,
                                  match.snippetMatch.start + match.snippetMatch.length,
                                )}
                              </mark>
                              {match.snippet.slice(
                                match.snippetMatch.start + match.snippetMatch.length,
                              )}
                            </>
                          ) : (
                            match.snippet
                          )}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <>
            <section className="space-y-1">
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {activeClass ? getClassShortLabel(activeClass) : "Notes"}
              </div>
              <div className="space-y-0.5">
                {notes.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    No notes in this class yet.
                  </p>
                ) : (
                  notes.map((note) => renderNoteItem(note))
                )}
              </div>
            </section>

                {/* Trash */}
                <section className="mt-5 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isTrashOpen;
                      setIsTrashOpen(next);
                      if (next && trashedNotes === null) void loadTrash();
                    }}
                    aria-expanded={isTrashOpen}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">Trash</span>
                    {trashedNotes ? <span>{trashedNotes.length}</span> : null}
                  </button>

                  {isTrashOpen ? (
                    <div className="mt-1 space-y-0.5">
                      {trashedNotes === null ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
                      ) : trashedNotes.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">Nothing deleted.</p>
                      ) : (
                        trashedNotes.map((trashed) => (
                          <div
                            key={trashed.id}
                            className="group flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {getRenderableTitle(trashed.title)}
                            </span>
                            <select
                              aria-label={`Restore "${getRenderableTitle(trashed.title)}" into a class`}
                              value=""
                              onChange={(event) => {
                                const classId = event.currentTarget.value;
                                if (classId) void handleRestoreNote(trashed, classId);
                              }}
                              disabled={classes.length === 0}
                              className="shrink-0 rounded border border-border bg-surface px-1 py-0.5 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
                            >
                              <option value="">Restore to…</option>
                              {classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                  {getClassShortLabel(cls)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleDeleteForever(trashed)}
                              className="shrink-0 rounded px-1.5 py-0.5 text-xs opacity-0 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </section>
              </>
            )}
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
                      {classes.map((cls) => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => void handleBulkMove(cls.id)}
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
                    onClick={handleExportNote}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    aria-label="Download note as Markdown"
                    title="Download as Markdown"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
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
                      // Draft only. Writing it into `notes` too made the commit
                      // compare the draft against itself and skip the save.
                      setTitleDraftState({
                        noteId: selectedNote.id,
                        value: event.currentTarget.value,
                      });
                    }}
                    onBlur={() => void handleTitleCommit()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="w-full border-none bg-transparent p-0 text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50"
                    placeholder="Untitled"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span suppressHydrationWarning>{formatTimestamp(selectedNote.updatedAt)}</span>
                    {selectedNote.fileName ? (
                      <span className="truncate">{selectedNote.fileName}</span>
                    ) : null}
                  </div>
                </div>

                <NoteEditor
                  handleRef={noteEditorRef}
                  className="mx-auto w-full px-4 pb-10 pt-6 md:px-10"
                  noteId={selectedNote.id}
                  initialMarkdown={selectedNote.content.markdown}
                  saveEnabled={!isTempNote(selectedNote.id)}
                  onSave={(noteId, markdown) => saveNote(noteId, { markdown })}
                />
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex h-full min-h-0 items-center justify-center p-6">
              {classes.length === 0 ? (
                // Notes live inside a class, so with none there is nothing to
                // create into. Offering a button that can only fail is worse
                // than saying where to go.
                <div className="flex max-w-sm flex-col items-center text-center">
                  <Folder className="mb-4 size-10 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-foreground">No classes yet</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Notes are filed under a class. Add one and its notes will live there.
                  </p>
                  <Link
                    href="/classes"
                    className={cx(
                      "mt-4 inline-flex h-10 items-center rounded-[var(--radius-lg)] px-4 text-sm font-medium",
                      "bg-accent text-accent-foreground hover:opacity-90",
                    )}
                  >
                    Go to classes
                  </Link>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleCreateNote(fallbackClassId)}
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
              )}
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
