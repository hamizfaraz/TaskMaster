"use client";

import dynamic from "next/dynamic";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { AlertCircle, Check, Code2, Eye, Loader2, Sparkles, Telescope } from "lucide-react";
import { BlockMenu } from "@/components/note-editor/block-menu";
import type { ImageUploader } from "@/components/note-editor/extensions/image-drop";
import type { ActiveLineRect, MarkdownEditorHandle } from "@/components/note-editor/markdown-editor";
import { useAutosave, type AutosaveStatus } from "@/components/note-editor/use-autosave";
import { countSuggestions } from "@/components/note-editor/extensions/highlight-suggestions";
import { isTempNoteId } from "@/lib/notes/records";
import { cx } from "@/lib/utils";
import { toast } from "sonner";

// CodeMirror is DOM-only; keep it out of the server bundle and initial paint.
const MarkdownEditor = dynamic(() => import("@/components/note-editor/markdown-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

/** What the workspace can ask the editor for. */
export type NoteEditorHandle = {
  /** The text as it stands right now, ahead of the autosave debounce. */
  getMarkdown(): string;
  /** Push any pending edit to the server and wait for it. */
  flush(): Promise<void>;
};

export type NoteEditorProps = {
  noteId: string;
  initialMarkdown: string;
  onSave: (noteId: string, markdown: string) => Promise<void>;
  /** False while the note is still being created (temporary client id). */
  saveEnabled?: boolean;
  readOnly?: boolean;
  /** Where dropped/pasted images go. Defaults to an inline data URL (see #86). */
  uploadImage?: ImageUploader;
  /** Lets the workspace read the live text, which lags behind `notes` by the debounce. */
  handleRef?: Ref<NoteEditorHandle>;
  className?: string;
};

function EditorSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-hidden="true">
      <div className="h-4 w-3/4 rounded bg-surface-elevated" />
      <div className="h-4 w-full rounded bg-surface-elevated" />
      <div className="h-4 w-5/6 rounded bg-surface-elevated" />
    </div>
  );
}

function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  if (status === "idle") {
    return null;
  }

  return (
    <div className="pointer-events-none sticky bottom-3 flex justify-end" aria-live="polite">
      <span
        className={cx(
          "pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
          status === "error"
            ? "border-red-200 bg-danger-soft text-danger dark:border-red-950/70"
            : "border-border bg-surface/90 text-muted-foreground backdrop-blur",
        )}
      >
        {status === "saving" ? <Loader2 className="size-3 animate-spin" /> : null}
        {status === "saved" ? <Check className="size-3" /> : null}
        {status === "error" ? <AlertCircle className="size-3" /> : null}
        {status === "dirty" && "Unsaved changes"}
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved"}
        {status === "error" ? (
          <>
            Save failed
            <button
              type="button"
              onClick={onRetry}
              className="ml-1 font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The note body editor. The CodeMirror document is the draft; this component
 * only decides which markdown the document should currently hold and wires
 * autosave. The workspace around it owns the title, sidebar, and CRUD.
 */
export function NoteEditor({
  noteId,
  initialMarkdown,
  onSave,
  saveEnabled = true,
  readOnly = false,
  uploadImage,
  handleRef,
  className,
}: NoteEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [activeLine, setActiveLine] = useState<ActiveLineRect | null>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const { status, draft, latest, notifyChange, flush, retry } = useAutosave({
    noteId,
    onSave,
    enabled: saveEnabled && !readOnly,
  });

  // What the editor should hold, in order of trust: the newest text this
  // session typed into this note (a switch-back must never remount from the
  // workspace's stale copy while a save is in flight); the text typed into
  // the temp note this one was just promoted from (it arrives with empty
  // markdown and the hook is still retargeting); otherwise the server state.
  const promotedFrom =
    draft !== null &&
    draft.noteId !== noteId &&
    isTempNoteId(draft.noteId) &&
    !isTempNoteId(noteId) &&
    initialMarkdown === ""
      ? draft.noteId
      : null;
  const value =
    latest[noteId] ?? (promotedFrom !== null ? latest[promotedFrom] : undefined) ?? initialMarkdown;

  // Switching to a different note: persist whatever the previous note still
  // had queued before its content leaves the editor.
  const lastNoteIdRef = useRef(noteId);
  useEffect(() => {
    if (lastNoteIdRef.current === noteId) {
      return;
    }
    const previousWasTemp = isTempNoteId(lastNoteIdRef.current);
    lastNoteIdRef.current = noteId;
    if (!previousWasTemp) {
      void flush();
    }
  }, [noteId, flush]);

  // Detection is pure text work over a document already in memory, so the
  // count is computed here rather than fetched. Only while the layer is on:
  // there is no reason to scan a document nobody asked about.
  const suggestionCount = useMemo(
    () => (showSuggestions ? countSuggestions(value) : 0),
    [showSuggestions, value],
  );

  /**
   * Ask the agent for a second opinion. The free ranker is always on and
   * costs nothing; this makes model calls, so it is a deliberate action
   * rather than something that happens while typing.
   */
  async function askForKeyPoints() {
    if (isAsking || isTempNoteId(noteId)) {
      return;
    }

    setIsAsking(true);
    setShowSuggestions(true);
    const toastId = toast.loading("Looking for the key points…", { duration: Infinity });

    try {
      await flush(); // the agent reads the saved note, so land any pending edit first
      const response = await fetch(`/api/notes/${noteId}/key-points`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { suggestions?: { from: number; to: number; text: string; reason: string }[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The request failed.");
      }

      const suggestions = payload?.suggestions ?? [];
      editorRef.current?.showAgentSuggestions(suggestions);
      if (suggestions.length === 0) {
        toast.success("Nothing extra stood out in this note", { id: toastId });
      } else {
        toast.success(
          `Found ${suggestions.length} point${suggestions.length === 1 ? "" : "s"} — click one to highlight it`,
          { id: toastId },
        );
      }
    } catch (error) {
      toast.error("Could not work out the key points", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
        duration: 5000,
      });
    } finally {
      setIsAsking(false);
    }
  }

  useImperativeHandle(
    handleRef,
    () => ({
      getMarkdown: () => value,
      flush,
    }),
    [value, flush],
  );

  const handleChange = (next: string) => {
    if (!readOnly) {
      notifyChange(next);
    }
  };

  return (
    <div className={cx("relative", className)}>
      <div className="mb-2 flex justify-end gap-2">
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setShowSuggestions((current) => !current)}
            aria-pressed={showSuggestions}
            title={
              showSuggestions
                ? "Hide suggested key points"
                : "Underline the points this note suggests are worth highlighting"
            }
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition",
              showSuggestions
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5" />
            {suggestionCount > 0 ? `${suggestionCount} key points` : "Key points"}
          </button>
        ) : null}
        {!readOnly && showSuggestions ? (
          <button
            type="button"
            onClick={() => void askForKeyPoints()}
            disabled={isAsking || isTempNoteId(noteId)}
            title="Ask for a second opinion, using this note's course context"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs text-muted-foreground transition hover:border-border-strong hover:text-foreground disabled:opacity-60"
          >
            {isAsking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Telescope className="size-3.5" />
            )}
            Look harder
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setSourceMode((current) => !current)}
          aria-pressed={sourceMode}
          title={sourceMode ? "Show live preview" : "Show Markdown source"}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs text-muted-foreground transition hover:border-border-strong hover:text-foreground"
        >
          {sourceMode ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
          {sourceMode ? "Preview" : "Source"}
        </button>
      </div>
      {/* Left gutter reserved for the "+" that follows the cursor's line. */}
      <div className="relative pl-9">
        {!readOnly && activeLine ? (
          <BlockMenu
            top={activeLine.top}
            height={activeLine.height}
            onPick={(command) => editorRef.current?.applyCommand(command)}
          />
        ) : null}
        <MarkdownEditor
          editorRef={editorRef}
          onActiveLineChange={setActiveLine}
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          sourceMode={sourceMode}
          showSuggestions={showSuggestions}
          uploadImage={uploadImage}
          autoFocus={!readOnly}
        />
      </div>
      <SaveStatus status={status} onRetry={() => void retry()} />
    </div>
  );
}
