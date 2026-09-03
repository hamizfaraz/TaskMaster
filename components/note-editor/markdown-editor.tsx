"use client";

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { editorTheme, markdownHighlight } from "@/components/note-editor/extensions/theme";

export type MarkdownEditorProps = {
  /**
   * The markdown to show. Applied to the document only when it differs from
   * what the editor already holds, so echoing `onChange` back is a no-op and
   * only a genuine external change (switching notes) replaces the text.
   */
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * CodeMirror 6 host. Deliberately DOM-only and free of app state so it can be
 * loaded with `next/dynamic` + `ssr: false` by `NoteEditor`.
 */
export default function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = "Start writing…",
  autoFocus = false,
  className,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment()).current;
  onChangeRef.current = onChange;

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
          readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
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
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly, readOnlyCompartment]);

  return <div ref={hostRef} className={className} data-testid="markdown-editor" />;
}
