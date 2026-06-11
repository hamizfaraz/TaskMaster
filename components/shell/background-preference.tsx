"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";

const ASCII_BACKGROUND_KEY = "taskmaster.asciiBackground.enabled";
const ASCII_BACKGROUND_EVENT = "taskmaster-ascii-background-change";

function readAsciiBackgroundEnabled() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(ASCII_BACKGROUND_KEY) !== "false";
}

function subscribeToAsciiBackground(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ASCII_BACKGROUND_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ASCII_BACKGROUND_EVENT, onStoreChange);
  };
}

export function setAsciiBackgroundEnabled(value: boolean) {
  window.localStorage.setItem(ASCII_BACKGROUND_KEY, String(value));
  window.dispatchEvent(new Event(ASCII_BACKGROUND_EVENT));
}

export function useAsciiBackgroundEnabled() {
  return useSyncExternalStore(
    subscribeToAsciiBackground,
    readAsciiBackgroundEnabled,
    () => true,
  );
}

export function AsciiBackgroundControl() {
  const enabled = useAsciiBackgroundEnabled();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { value: true, label: "On", description: "Show animated ASCII texture." },
        { value: false, label: "Off", description: "Use plain backgrounds." },
      ].map((option) => {
        const selected = enabled === option.value;

        return (
          <Button
            key={String(option.value)}
            type="button"
            variant={selected ? "primary" : "outline"}
            className={cx(
              "h-auto justify-start px-3 py-2 text-left",
              selected ? "" : "text-muted-foreground",
            )}
            onClick={() => setAsciiBackgroundEnabled(option.value)}
          >
            <span>
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-xs font-normal leading-5 opacity-80">
                {option.description}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
