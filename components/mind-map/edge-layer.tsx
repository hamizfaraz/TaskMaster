"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { cx } from "@/lib/utils";
import type { MindMapEdge, MindMapNode } from "@/lib/mind-maps/types";

type Point = { x: number; y: number };

type EdgeLayerProps = {
  edges: MindMapEdge[];
  nodeById: Map<string, MindMapNode>;
  draft: { source: Point; cursor: Point } | null;
};

/** SVG overlay that draws every association line plus the in-progress connect line. */
export function EdgeLayer({ edges, nodeById, draft }: EdgeLayerProps) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
      {edges.map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);
        if (!source || !target) return null;

        return (
          <line
            key={edge.id}
            x1={source.positionX}
            y1={source.positionY}
            x2={target.positionX}
            y2={target.positionY}
            stroke={edge.isSuggested ? "var(--accent)" : "var(--border-strong)"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={edge.isSuggested ? "6 5" : undefined}
            opacity={edge.isSuggested ? 0.75 : 1}
          />
        );
      })}

      {draft ? (
        <line
          x1={draft.source.x}
          y1={draft.source.y}
          x2={draft.cursor.x}
          y2={draft.cursor.y}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

type EdgeLabelChipProps = {
  edge: MindMapEdge;
  midpoint: Point;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (label: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
};

/** HTML chip at the midpoint of an edge for viewing/editing the association's meaning. */
export function EdgeLabelChip({
  edge,
  midpoint,
  isEditing,
  onStartEdit,
  onCommit,
  onCancelEdit,
  onDelete,
}: EdgeLabelChipProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      cancelRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center"
      style={{ left: midpoint.x, top: midpoint.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          defaultValue={edge.label ?? ""}
          maxLength={200}
          placeholder="meaning…"
          className="w-[140px] rounded-full border border-accent bg-surface px-3 py-1 text-xs text-foreground outline-none shadow-[var(--shadow-card)]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              inputRef.current?.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRef.current = true;
              inputRef.current?.blur();
            }
          }}
          onBlur={(event) => {
            if (cancelRef.current) {
              onCancelEdit();
              return;
            }
            onCommit(event.target.value.trim());
          }}
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onStartEdit}
            title={edge.isSuggested ? "AI-suggested connection" : undefined}
            className={cx(
              "rounded-full border px-2.5 py-1 text-xs font-medium shadow-[var(--shadow-card)] transition",
              edge.isSuggested
                ? "border-accent/40 bg-accent-soft text-accent hover:border-accent"
                : edge.label
                  ? "border-border bg-surface text-foreground hover:border-accent/70"
                  : "border-dashed border-border bg-surface/80 text-muted-foreground hover:border-accent/70 hover:text-foreground",
            )}
          >
            {edge.label ? edge.label : "+ label"}
          </button>
          <button
            type="button"
            aria-label="Delete connection"
            onClick={onDelete}
            className="hidden rounded-full border border-border bg-surface p-1 text-muted-foreground shadow-[var(--shadow-card)] transition hover:bg-danger-soft hover:text-danger group-hover:inline-flex"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
