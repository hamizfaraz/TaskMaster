"use client";

import { useEffect } from "react";
import { applyTheme } from "@/components/ui/theme-toggle";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

function readStoredTheme(): ThemePreference {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system"
    ? saved
    : "system";
}

export function ThemeInitializer() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}
