"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SidebarBehaviorControl } from "@/components/shell/sidebar-preference";
import { AsciiBackgroundControl } from "@/components/shell/background-preference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { authClient } from "@/lib/auth-client";

type ProfileSettingsFormProps = {
  name: string;
  email: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Could not update your profile.";
}

export function ProfileSettingsForm({ name, email }: ProfileSettingsFormProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = draftName.trim();
    if (!nextName) {
      setStatus(null);
      setError("Display name is required.");
      return;
    }

    if (nextName === name) {
      setError(null);
      setStatus("Profile is already up to date.");
      return;
    }

    setError(null);
    setStatus("Saving profile...");
    setIsSaving(true);

    try {
      const result = await authClient.updateUser({ name: nextName });

      if (result.error) {
        throw new Error(result.error.message || "Could not update your profile.");
      }

      setStatus("Profile updated.");
      startTransition(() => {
        router.refresh();
      });
    } catch (profileError) {
      setStatus(null);
      setError(getErrorMessage(profileError));
    } finally {
      setIsSaving(false);
    }
  }

  const isPending = isSaving || isRefreshing;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Profile
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This name appears in your workspace sidebar and dashboard greeting.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground">Display name</span>
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.currentTarget.value)}
              autoComplete="name"
              className="mt-2"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Email</span>
            <Input value={email} className="mt-2" readOnly />
          </label>

          {status || error ? (
            <div
              aria-live="polite"
              className={
                error
                  ? "rounded-[var(--radius-lg)] border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
                  : "rounded-[var(--radius-lg)] border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {error ?? status}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save profile"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftName(name);
                setStatus(null);
                setError(null);
              }}
              disabled={isPending || draftName === name}
            >
              Reset
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Workspace
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Appearance and session controls for this account.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <div className="mt-2">
              <ThemeToggle />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">Background texture</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Toggle the animated ASCII background for visual clarity.
            </p>
            <div className="mt-3">
              <AsciiBackgroundControl />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">Sidebar</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Choose whether the sidebar uses an edge tab or expands from the icon rail on hover.
            </p>
            <div className="mt-3">
              <SidebarBehaviorControl />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="mb-2 text-sm font-medium text-foreground">Session</p>
            <SignOutButton />
          </div>
        </div>
      </section>
    </div>
  );
}
