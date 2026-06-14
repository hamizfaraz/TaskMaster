"use client";

import { PanelLeftOpen, Plus } from "lucide-react";

type CollapsedRailProps = {
  onExpand: () => void;
  expandLabel: string;
  onNew?: () => void;
  newLabel?: string;
  newDisabled?: boolean;
};

/**
 * Slim vertical strip shown in place of a list sidebar when it is collapsed.
 * Always renders an expand control (so the user is never stuck) plus an
 * optional "new" shortcut. Shared by the Notes and Cheat Sheet workspaces.
 */
export function CollapsedRail({
  onExpand,
  expandLabel,
  onNew,
  newLabel,
  newDisabled,
}: CollapsedRailProps) {
  return (
    <aside className="flex h-full min-h-0 flex-row items-center gap-1 border-b border-border bg-surface-muted/70 px-1.5 py-2 lg:flex-col lg:border-b-0 lg:border-r lg:py-3">
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
        aria-label={expandLabel}
        title={expandLabel}
      >
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      </button>
      {onNew ? (
        <button
          type="button"
          onClick={onNew}
          disabled={newDisabled}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
          aria-label={newLabel}
          title={newLabel}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}
