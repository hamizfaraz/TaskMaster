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

/** Diameter of the gutter button, used to centre it on the line. */
const BUTTON_SIZE = 24;

/** Breathing room kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN = 8;

/**
 * How far (px) to slide the menu up so its bottom stays on screen. Never
 * pushes its top above the viewport; a menu taller than the viewport is
 * left to its own max-height scroll.
 */
export function menuShiftFor(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  margin = VIEWPORT_MARGIN,
) {
  const overflow = rect.bottom - (viewportHeight - margin);
  if (overflow <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(overflow, rect.top - margin));
}

export type BlockMenuProps = {
  /** Top of the active line, relative to the editor host. */
  top: number;
  /** Height of the active line. */
  height: number;
  /** Called with the chosen command; the caller applies it to the editor. */
  onPick: (command: Completion) => void;
};

/**
 * The "+" that sits in the left gutter beside the line the cursor is on —
 * the mouse-driven counterpart to the `/` menu. Both read the same
 * `slashCommands` list, so they can never offer different things.
 */
export function BlockMenu({ top, height, onPick }: BlockMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = () => setOpen(false);

  const pick = (command: Completion) => {
    close();
    onPick(command);
  };

  /** Keep every option on screen when the button sits low in the viewport. */
  const keepMenuOnScreen = () => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const shift = menuShiftFor(menu.getBoundingClientRect(), window.innerHeight);
    menu.style.transform = shift > 0 ? `translateY(-${shift}px)` : "";
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // The menu exists on the next frame: place it, then land keyboard
      // users on the first item.
      requestAnimationFrame(() => {
        keepMenuOnScreen();
        itemRefs.current[0]?.focus();
      });
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
    <div
      className="absolute left-0 z-20"
      style={{ top: Math.max(0, top + (height - BUTTON_SIZE) / 2) }}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        onClick={toggle}
        onMouseDown={(event) => event.preventDefault()} // keep the editor's selection where it is
        aria-label="Insert block"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Insert a block here"
        className="flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition hover:border-border-strong hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[49]" onClick={close} />
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="Insert block"
            className="absolute left-7 top-0 z-[50] max-h-[calc(100vh-1rem)] min-w-[15rem] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface-elevated py-1 shadow-[var(--shadow-card)]"
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
