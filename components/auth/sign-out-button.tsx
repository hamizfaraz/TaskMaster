"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/utils";

type SignOutButtonProps = {
  compact?: boolean;
  className?: string;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
};

export function SignOutButton({ compact = false, className, onMouseEnter, onMouseLeave }: SignOutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);

    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isPending}
        aria-label="Sign out"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cx(
          "flex h-10 w-full items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50",
          className,
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
            <path d="M14 8l4 4-4 4" />
            <path d="M18 12H9" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      variant="outline"
      size="sm"
      className={cx("w-full justify-center", className)}
      title="Sign out"
      aria-label="Sign out"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
