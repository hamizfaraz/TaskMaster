"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Completion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { imageDrop, type ImageUploader } from "@/components/note-editor/extensions/image-drop";
import { livePreview } from "@/components/note-editor/extensions/live-preview";
import { mathWidgets } from "@/components/note-editor/extensions/math-widgets";
import { applyBlockCommand, slashMenu } from "@/components/note-editor/extensions/slash-menu";
import { editorTheme, markdownHighlight } from "@/components/note-editor/extensions/theme";

function previewExtensions(sourceMode: boolean) {
  return sourceMode ? [] : [livePreview(), mathWidgets()];
}

/** What React-side controls (the "+ Block" button) may ask the editor to do. */
export type MarkdownEditorHandle = {
  focus(): void;
  /** Insert a block command at the cursor — the same commands the `/` menu offers. */
  applyCommand(command: Completion): void;
};

/** Where the cursor's line sits, relative to the editor host's top edge. */
export type ActiveLineRect = {
  top: number;
  height: number;
};

/** Marks a document replacement driven by the `value` prop, not by typing. */
const externalValue = Annotation.define<boolean>();

export type MarkdownEditorProps = {
  /** Receives an imperative handle once the editor is mounted. */
  editorRef?: Ref<MarkdownEditorHandle>;
  /**
   * Reports the active line's position whenever it moves, or `null` when it
   * cannot be measured (off-screen, or replaced by a block widget). Lets a
   * React-side gutter control follow the cursor.
   */
  onActiveLineChange?: (rect: ActiveLineRect | null) => void;
  /**
   * The markdown to show. Applied to the document only when it differs from
   * what the editor already holds, and never reported back through
   * `onChange`: switching notes replaces the text without counting as an
   * edit (which used to queue a needless save of the new note's own content).
   */
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  /** Show raw Markdown everywhere instead of live preview. */
  sourceMode?: boolean;
  /** Handles dropped/pasted image files; defaults to an inline data URL. */
  uploadImage?: ImageUploader;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * CodeMirror 6 host. Deliberately DOM-only and free of app state so it can be
 * loaded with `next/dynamic` + `ssr: false` by `NoteEditor`.
 */
export default function MarkdownEditor({
  editorRef,
  onActiveLineChange,
  value,
  onChange,
  readOnly = false,
  sourceMode = false,
  uploadImage,
  placeholder = "Start writing…",
  autoFocus = false,
  className,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment()).current;
  const previewCompartment = useRef(new Compartment()).current;
  const uploadCompartment = useRef(new Compartment()).current;
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const lastActiveLineKeyRef = useRef("");
  onChangeRef.current = onChange;
  onActiveLineChangeRef.current = onActiveLineChange;

  /**
   * Measure through CodeMirror's read/write cycle so layout is read once the
   * DOM is settled, and only report when the position actually changed.
   */
  const measureActiveLine = (view: EditorView) => {
    const host = hostRef.current;
    if (!host || !onActiveLineChangeRef.current) {
      return;
    }
    view.requestMeasure<ActiveLineRect | null>({
      key: "active-line",
      read: (measured) => {
        const line = measured.state.doc.lineAt(measured.state.selection.main.head);
        const coords = measured.coordsAtPos(line.from, 1);
        if (!coords) {
          return null;
        }
        const hostTop = host.getBoundingClientRect().top;
        return { top: coords.top - hostTop, height: coords.bottom - coords.top };
      },
      write: (rect) => {
        const key = rect ? `${Math.round(rect.top)}:${Math.round(rect.height)}` : "none";
        if (key === lastActiveLineKeyRef.current) {
          return;
        }
        lastActiveLineKeyRef.current = key;
        onActiveLineChangeRef.current?.(rect);
      },
    });
  };

  useImperativeHandle(
    editorRef,
    () => ({
      focus: () => viewRef.current?.focus(),
      applyCommand: (command) => {
        const view = viewRef.current;
        if (view) {
          applyBlockCommand(view, command);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          markdownHighlight,
          editorTheme,
          placeholderExtension(placeholder),
          slashMenu(),
          uploadCompartment.of(imageDrop(uploadImage)),
          previewCompartment.of(previewExtensions(sourceMode)),
          readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(externalValue))
            ) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (
              update.selectionSet ||
              update.docChanged ||
              update.geometryChanged ||
              update.viewportChanged
            ) {
              measureActiveLine(update.view);
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    measureActiveLine(view);
    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later prop changes are applied by the effects
    // below via transactions rather than by rebuilding the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: 0 },
        annotations: externalValue.of(true),
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly, readOnlyCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: previewCompartment.reconfigure(previewExtensions(sourceMode)),
    });
  }, [sourceMode, previewCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: uploadCompartment.reconfigure(imageDrop(uploadImage)),
    });
  }, [uploadImage, uploadCompartment]);

  return <div ref={hostRef} className={className} data-testid="markdown-editor" />;
}
