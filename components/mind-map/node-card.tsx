"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { Link2, Trash2 } from "lucide-react";
import { cx } from "@/lib/utils";
import type { MindMapNode } from "@/lib/mind-maps/types";

type NodeCardProps = {
  node: MindMapNode;
  isEditing: boolean;
  isConnectSource: boolean;
  onPointerDownCard: (event: ReactPointerEvent) => void;
  onStartConnect: (event: ReactPointerEvent) => void;
  onStartEdit: () => void;
  onCommitLabel: (label: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
};

export function NodeCard({
  node,
  isEditing,
  isConnectSource,
  onPointerDownCard,
  onStartConnect,
  onStartEdit,
  onCommitLabel,
  onCancelEdit,
  onDelete,
}: NodeCardProps) {
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
      data-node-id={node.id}
      className={cx(
        "group absolute flex w-max max-w-[220px] cursor-grab items-center rounded-[var(--radius-xl)] border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-card)] transition select-none active:cursor-grabbing",
        isConnectSource ? "border-accent ring-2 ring-accent/40" : "border-border-strong hover:border-accent/70",
      )}
      style={{ left: node.positionX, top: node.positionY, transform: "translate(-50%, -50%)" }}
      onPointerDown={onPointerDownCard}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          defaultValue={node.label}
          maxLength={200}
          className="w-[160px] bg-transparent text-sm font-medium text-foreground outline-none"
          onPointerDown={(event) => event.stopPropagation()}
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
            const next = event.target.value.trim();
            if (next && next !== node.label) {
              onCommitLabel(next);
            } else {
              onCancelEdit();
            }
          }}
        />
      ) : (
        <span className="truncate">{node.label}</span>
      )}

      {!isEditing ? (
        <button
          type="button"
          aria-label="Delete topic"
          className="ml-2 hidden shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-danger-soft hover:text-danger group-hover:inline-flex"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}

      {/* Connect handle — drag from here to another topic to draw an association. */}
      <button
        type="button"
        aria-label="Connect to another topic"
        title="Drag to another topic to connect"
        className="absolute -bottom-2.5 left-1/2 flex size-5 -translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-[var(--shadow-card)] transition hover:bg-accent hover:text-accent-foreground"
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnect(event);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <Link2 className="size-3" />
      </button>
    </div>
  );
}
