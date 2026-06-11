"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { AsciiBackground } from "./ascii-background";
import { useAsciiBackgroundEnabled } from "./background-preference";
import { AppSidebar } from "./app-sidebar";
import { useSidebarBehavior } from "./sidebar-preference";

type AppShellProps = {
  children: ReactNode;
  displayName: string;
};

export function AppShell({ children, displayName }: AppShellProps) {
  const pathname = usePathname();
  const isNotesRoute = pathname.startsWith("/notes");
  const isDashboard = pathname === "/";
  const sidebarBehavior = useSidebarBehavior();
  const [collapsed, setCollapsed] = useState(true);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const asciiBackgroundEnabled = useAsciiBackgroundEnabled();
  const hoverMode = sidebarBehavior === "hover";
  const sidebarCollapsed = hoverMode ? !hoverExpanded : collapsed;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar
        pathname={pathname}
        displayName={displayName}
        behavior={sidebarBehavior}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        onHoverChange={setHoverExpanded}
      />
      <div className="app-background min-h-0 min-w-0 flex-1">
        {asciiBackgroundEnabled ? <AsciiBackground /> : null}
        <main
          className={cx(
            "relative z-10 h-full w-full",
            isNotesRoute
              ? "overflow-hidden p-0"
              : isDashboard
              ? "flex flex-col p-3"
              : "p-3",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
