"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Code2, Eye, Loader2 } from "lucide-react";
import { BlockMenu } from "@/components/note-editor/block-menu";
import type { ImageUploader } from "@/components/note-editor/extensions/image-drop";
import type { MarkdownEditorHandle } from "@/components/note-editor/markdown-editor";
import { useAutosave, type AutosaveStatus } from "@/components/note-editor/use-autosave";
import { isTempNoteId } from "@/lib/notes/records";
import { cx } from "@/lib/utils";

// CodeMirror is DOM-only; keep it out of the server bundle and initial paint.
const MarkdownEditor = dynamic(() => import("@/components/note-editor/markdown-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export type NoteEditorProps = {
  noteId: string;
  initialMarkdown: string;
  onSave: (noteId: string, markdown: string) => Promise<void>;
  /** False while the note is still being created (temporary client id). */
  saveEnabled?: boolean;
  readOnly?: boolean;
  /** Where dropped/pasted images go. Defaults to an inline data URL (see #86). */
  uploadImage?: ImageUploader;
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
  className,
}: NoteEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const { status, draft, notifyChange, flush, retry } = useAutosave({
    noteId,
    onSave,
    enabled: saveEnabled && !readOnly,
  });

  // A temp note being promoted to its real id arrives with empty markdown;
  // keep what the user typed rather than replacing it (the autosave hook
  // retargets and persists it). Everything else derives from props.
  const promoted =
    draft !== null &&
    draft.noteId !== noteId &&
    isTempNoteId(draft.noteId) &&
    !isTempNoteId(noteId) &&
    initialMarkdown === "";
  const value =
    draft !== null && (draft.noteId === noteId || promoted) ? draft.markdown : initialMarkdown;

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

  const handleChange = (next: string) => {
    if (!readOnly) {
      notifyChange(next);
    }
  };

  return (
    <div className={cx("relative", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        {readOnly ? <span /> : <BlockMenu onPick={(command) => editorRef.current?.applyCommand(command)} />}
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
      <MarkdownEditor
        editorRef={editorRef}
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        sourceMode={sourceMode}
        uploadImage={uploadImage}
        autoFocus={!readOnly}
      />
      <SaveStatus status={status} onRetry={() => void retry()} />
    </div>
  );
}
