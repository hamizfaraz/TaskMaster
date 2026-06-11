"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cx } from "@/lib/utils";
import { NavIconGlyph } from "./nav-icon";
import { isActivePath, primaryNavItems, studyNavItems } from "./navigation";
import type { SidebarBehavior } from "./sidebar-preference";

type TooltipState = { label: string; y: number } | null;
type MenuPos = { bottom: number; left: number } | null;
type StudyMenuPos = { top: number; left: number } | null;

type AppSidebarProps = {
  pathname: string;
  displayName: string;
  behavior: SidebarBehavior;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onHoverChange: (expanded: boolean) => void;
};

function Chevron({
  direction,
}: {
  direction: "left" | "right" | "down" | "up";
}) {
  const rotation = {
    left: "rotate(180deg)",
    right: "rotate(0deg)",
    down: "rotate(90deg)",
    up: "rotate(-90deg)",
  }[direction];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      style={{ transform: rotation }}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function AppSidebar({
  pathname,
  displayName,
  behavior,
  collapsed,
  onToggleCollapsed,
  onHoverChange,
}: AppSidebarProps) {
  const [studyOpen, setStudyOpen] = useState(() =>
    pathname.startsWith("/study"),
  );
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [menuPos, setMenuPos] = useState<MenuPos>(null);
  const [studyMenuPos, setStudyMenuPos] = useState<StudyMenuPos>(null);
  const studyButtonRef = useRef<HTMLButtonElement>(null);
  const studyMenuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menuPos && !studyMenuPos) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuPos &&
        menuRef.current &&
        !menuRef.current.contains(target) &&
        profileRef.current &&
        !profileRef.current.contains(target)
      ) {
        setMenuPos(null);
      }
      if (
        studyMenuPos &&
        studyMenuRef.current &&
        !studyMenuRef.current.contains(target) &&
        studyButtonRef.current &&
        !studyButtonRef.current.contains(target)
      ) {
        setStudyMenuPos(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuPos(null);
        setStudyMenuPos(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuPos, studyMenuPos]);

  function toggleMenu() {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const rect = profileRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      bottom: window.innerHeight - rect.bottom,
      left: rect.right + 8,
    });
  }

  function toggleStudyMenu() {
    if (!collapsed) {
      setStudyMenuPos(null);
      setStudyOpen((current) => !current);
      return;
    }

    if (studyMenuPos) {
      setStudyMenuPos(null);
      return;
    }

    const rect = studyButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    hideTooltip();
    setStudyMenuPos({
      top: Math.min(Math.max(12, rect.top), window.innerHeight - 332),
      left: rect.right + 8,
    });
  }

  async function handleSignOut() {
    setMenuPos(null);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  function showTooltip(e: React.MouseEvent<HTMLElement>, label: string) {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2 });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  const initials = useMemo(
    () =>
      displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "TM",
    [displayName],
  );

  return (
    <aside
      onMouseEnter={() => {
        if (behavior === "hover") {
          onHoverChange(true);
        }
      }}
      onMouseLeave={() => {
        if (behavior === "hover") {
          onHoverChange(false);
        }
      }}
      onFocusCapture={() => {
        if (behavior === "hover") {
          onHoverChange(true);
        }
      }}
      onBlurCapture={(event) => {
        if (
          behavior === "hover" &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          onHoverChange(false);
        }
      }}
      className={cx(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border bg-surface px-2.5 py-3 transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-56 max-lg:w-16",
      )}
    >
      {tooltip && collapsed ? (
        <div
          className="pointer-events-none fixed z-50 ml-1 -translate-y-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md"
          style={{ top: tooltip.y, left: 64 }}
          aria-hidden
        >
          {tooltip.label}
        </div>
      ) : null}
      <div
        className={cx(
          "flex items-center gap-2 pb-3",
          collapsed
            ? "justify-center px-0"
            : "justify-between px-1 max-lg:justify-center max-lg:px-0",
        )}
      >
        <Link
          href="/"
          className={cx(
            "flex min-w-0 items-center gap-2.5",
            collapsed ? "justify-center" : "max-lg:justify-center",
          )}
          aria-label="TaskMaster home"
          title="TaskMaster"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black font-mono text-[0.45rem] leading-[1.15] text-white"
            aria-label="TaskMaster"
            style={{ whiteSpace: "pre", letterSpacing: 0 }}
          >{` /\\_/\\
( o.o )
 > ^ <`}</span>
          {!collapsed ? (
            <div className="min-w-0 max-lg:hidden">
              <p className="truncate text-[0.92rem] font-semibold tracking-tight text-foreground">
                TaskMaster
              </p>
              {/* <p className="truncate text-[0.72rem] text-muted-foreground">
                Academic workspace
              </p> */}
            </div>
          ) : null}
        </Link>
        {behavior === "manual" ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-5 z-40 hidden h-8 w-6 items-center justify-center rounded-r-full border border-l-0 border-border bg-surface text-muted-foreground shadow-[var(--shadow-card)] transition hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 lg:inline-flex"
          >
            <Chevron direction={collapsed ? "right" : "left"} />
          </button>
        ) : null}
      </div>

      <nav
        aria-label="Primary navigation"
        className={cx(
          "flex-1 overflow-y-auto",
          collapsed ? "space-y-1" : "space-y-0.5",
        )}
      >
        {primaryNavItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onMouseEnter={(e) => showTooltip(e, item.label)}
              onMouseLeave={hideTooltip}
              className={cx(
                "group relative flex items-center gap-2.5 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
                collapsed
                  ? "h-10 justify-center px-0"
                  : "px-2.5 py-2 max-lg:h-10 max-lg:justify-center max-lg:px-0",
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {active ? (
                <span
                  className={cx(
                    "absolute left-0 h-5 w-0.5 rounded-full bg-accent",
                    !collapsed && "lg:hidden",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cx(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition",
                  active
                    ? "bg-surface text-accent shadow-[inset_0_0_0_1px_var(--border)]"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                <NavIconGlyph name={item.icon} />
              </span>
              {!collapsed ? (
                <span className="truncate max-lg:hidden">{item.label}</span>
              ) : null}
            </Link>
          );
        })}

        <div className="pt-1.5">
          <button
            ref={studyButtonRef}
            type="button"
            onClick={toggleStudyMenu}
            aria-expanded={collapsed ? Boolean(studyMenuPos) : studyOpen}
            aria-label="Study"
            onMouseEnter={(e) => showTooltip(e, "Study")}
            onMouseLeave={hideTooltip}
            className={cx(
              "relative flex w-full items-center gap-2.5 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
              collapsed
                ? "h-10 justify-center px-0"
                : "px-2.5 py-2 max-lg:h-10 max-lg:justify-center max-lg:px-0",
              pathname.startsWith("/study")
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {pathname.startsWith("/study") ? (
              <span
                className={cx(
                  "absolute left-0 h-5 w-0.5 rounded-full bg-accent",
                  !collapsed && "lg:hidden",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                pathname.startsWith("/study")
                  ? "bg-surface text-accent shadow-[inset_0_0_0_1px_var(--border)]"
                  : "text-muted-foreground",
              )}
            >
              <NavIconGlyph name="study" />
            </span>
            {!collapsed ? (
              <>
                <span className="flex-1 text-left max-lg:hidden">Study</span>
                <span className="max-lg:hidden">
                  <Chevron direction={studyOpen ? "down" : "right"} />
                </span>
              </>
            ) : null}
          </button>
          {!collapsed && studyOpen ? (
            <div className="mt-1 space-y-0.5 pl-9 max-lg:hidden">
              {studyNavItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "block rounded-md px-2.5 py-1.5 text-[0.82rem] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
                      active
                        ? "bg-surface-muted text-foreground"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="mt-3 border-t border-border pt-3">
        <button
          ref={profileRef}
          onClick={toggleMenu}
          onMouseEnter={(e) => collapsed && showTooltip(e, displayName)}
          onMouseLeave={() => collapsed && hideTooltip()}
          aria-label={`Open menu for ${displayName}`}
          className={cx(
            "flex w-full items-center gap-2.5 rounded-lg transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
            menuPos ? "bg-surface-muted" : "",
            collapsed
              ? "justify-center p-0.5"
              : "px-2 py-2 max-lg:justify-center max-lg:p-0.5",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-xs font-semibold text-foreground">
            {initials}
          </span>
          {!collapsed ? (
            <div className="min-w-0 max-lg:hidden">
              <p className="truncate text-[0.83rem] font-medium text-foreground">
                {displayName}
              </p>
              <p className="truncate text-[0.7rem] text-muted-foreground">
                Account
              </p>
            </div>
          ) : null}
        </button>
      </div>

      {collapsed && studyMenuPos ? (
        <div
          ref={studyMenuRef}
          style={{ top: studyMenuPos.top, left: studyMenuPos.left }}
          className="fixed z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-accent">
              <NavIconGlyph name="study" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.83rem] font-semibold text-foreground">
                Study
              </p>
              <p className="truncate text-[0.7rem] text-muted-foreground">
                Tools
              </p>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="py-1">
            {studyNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setStudyMenuPos(null)}
                  className={cx(
                    "block px-3.5 py-2.5 text-[0.83rem] transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {menuPos ? (
        <div
          ref={menuRef}
          style={{ bottom: menuPos.bottom, left: menuPos.left }}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-xs font-semibold text-foreground">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.83rem] font-semibold text-foreground">
                {displayName}
              </p>
              <p className="truncate text-[0.7rem] text-muted-foreground">
                Account
              </p>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="py-1">
            <Link
              href="/settings?tab=profile"
              onClick={() => setMenuPos(null)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[0.83rem] text-foreground transition hover:bg-surface-muted"
            >
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuPos(null)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[0.83rem] text-foreground transition hover:bg-surface-muted"
            >
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              Settings
            </Link>
          </div>

          <div className="border-t border-border" />

          <div className="py-1">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[0.83rem] text-foreground transition hover:bg-surface-muted"
            >
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
