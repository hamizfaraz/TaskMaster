"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Completion } from "@codemirror/autocomplete";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Sigma,
  Table,
  Type,
  type LucideIcon,
} from "lucide-react";
import { slashCommands } from "@/components/note-editor/extensions/slash-menu";

/** Keyed by each command's stable `type` (see `slashCommands`). */
const ICONS: Record<string, LucideIcon> = {
  text: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  bullet: List,
  number: ListOrdered,
  checklist: ListChecks,
  quote: Quote,
  code: Code,
  table: Table,
  image: ImageIcon,
  divider: Minus,
  math: Sigma,
  "inline-math": Sigma,
};

export type BlockMenuProps = {
  /** Called with the chosen command; the caller applies it to the editor. */
  onPick: (command: Completion) => void;
  disabled?: boolean;
};

/**
 * Mouse-driven counterpart to the `/` menu: a "+ Block" button listing every
 * block type. Both surfaces read the same `slashCommands` list, so they can
 * never offer different things.
 */
export function BlockMenu({ onPick, disabled = false }: BlockMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = () => setOpen(false);

  const pick = (command: Completion) => {
    close();
    onPick(command);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Land keyboard users on the first item once it exists.
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    if (items.length === 0) {
      return;
    }
    const current = items.findIndex((item) => item === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Insert a block at the cursor"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs text-muted-foreground transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-3.5" />
        Block
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[49]" onClick={close} />
          <div
            id={menuId}
            role="menu"
            aria-label="Insert block"
            className="absolute left-0 top-9 z-[50] min-w-[15rem] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated py-1 shadow-[var(--shadow-card)]"
          >
            {slashCommands.map((command, index) => {
              const Icon = ICONS[command.type ?? ""] ?? Plus;
              return (
                <button
                  key={command.label}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(command)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{command.label}</span>
                  {command.detail ? (
                    <span className="text-xs text-muted-foreground">{command.detail}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
