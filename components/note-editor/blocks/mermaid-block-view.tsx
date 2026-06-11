"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { NoteMermaidBlockData } from "@/lib/notes/types";
import {
  getMermaidErrorMessage,
  renderMermaidSvg,
} from "@/components/note-editor/blocks/mermaid-renderer";

type MermaidBlockViewProps = {
  data: NoteMermaidBlockData;
};

type MermaidRenderState =
  | { code: string; status: "success"; svg: string }
  | { code: string; status: "error"; message: string };

export function MermaidBlockView({ data }: MermaidBlockViewProps) {
  const code = data.code.trim();
  const [renderState, setRenderState] = useState<MermaidRenderState | null>(null);
  const visibleState = !code
    ? ({ status: "idle" } as const)
    : renderState?.code === code
      ? renderState
      : ({ status: "loading" } as const);

  useEffect(() => {
    let disposed = false;

    if (!code) {
      return;
    }

    renderMermaidSvg(code)
      .then((svg) => {
        if (!disposed) {
          setRenderState({ code, status: "success", svg });
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setRenderState({
            code,
            status: "error",
            message: getMermaidErrorMessage(error),
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [code]);

  return (
    <div className="note-mermaid-block note-mermaid-block--read">
      <div className="note-mermaid-block__header">
        <span className="note-mermaid-block__lang">mermaid</span>
      </div>
      <div className="note-mermaid-block__surface">
        {visibleState.status === "idle" ? (
          <div className="note-mermaid-block__placeholder">No diagram yet.</div>
        ) : null}
        {visibleState.status === "loading" ? (
          <div className="note-mermaid-block__status">
            <Loader2 className="size-4 animate-spin" />
            Rendering diagram...
          </div>
        ) : null}
        {visibleState.status === "error" ? (
          <div className="note-mermaid-block__error">
            <strong>Could not render this Mermaid diagram.</strong>
            <span>{visibleState.message}</span>
            <pre>{data.code}</pre>
          </div>
        ) : null}
        {visibleState.status === "success" ? (
          <div
            className="note-mermaid-block__diagram"
            dangerouslySetInnerHTML={{ __html: visibleState.svg }}
          />
        ) : null}
      </div>
    </div>
  );
}
