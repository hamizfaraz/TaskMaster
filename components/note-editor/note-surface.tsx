"use client";

import { useState, type ReactNode } from "react";
import { NoteEditor } from "@/components/note-editor/note-editor";
import { NoteRenderer } from "@/components/note-editor/note-renderer";
import { createNoteContent } from "@/lib/notes/markdown";
import type { NoteContent, NoteDocument, NoteImageFileData } from "@/lib/notes/types";

export type NoteSurfaceProps = {
  initialDocument: NoteDocument;
  onContentChange?: (content: NoteContent) => void;
  onSave?: (content: NoteContent) => Promise<void>;
  uploadImage?: (file: File) => Promise<NoteImageFileData>;
  readOnly?: boolean;
  keepEditingWhenEmpty?: boolean;
  selectionPrelude?: ReactNode;
};

function areDocumentsEqual(left: NoteDocument, right: NoteDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function NoteSurface({
  initialDocument,
  onContentChange,
  onSave,
  uploadImage,
  readOnly = false,
  selectionPrelude,
}: NoteSurfaceProps) {
  const [draftState, setDraftState] = useState(() => ({
    sourceDocument: initialDocument,
    content: createNoteContent(initialDocument),
  }));
  const content = areDocumentsEqual(draftState.sourceDocument, initialDocument)
    ? draftState.content
    : createNoteContent(initialDocument);

  const updateContent = (nextContent: NoteContent) => {
    setDraftState({
      sourceDocument: initialDocument,
      content: nextContent,
    });
  };

  if (!readOnly) {
    return (
      <div className="note-surface note-surface--editing flex min-h-full shrink-0 flex-col">
        <NoteEditor
          initialDocument={content.document}
          onContentChange={(nextContent) => {
            updateContent(nextContent);
            onContentChange?.(nextContent);
          }}
          onSave={async (nextContent) => {
            updateContent(nextContent);
            await onSave?.(nextContent);
          }}
          uploadImage={uploadImage}
          selectionPrelude={selectionPrelude}
        />
      </div>
    );
  }

  return (
    <div className="note-surface">
      <div className="note-surface__content">
        <NoteRenderer markdown={content.markdown} />
      </div>
    </div>
  );
}
