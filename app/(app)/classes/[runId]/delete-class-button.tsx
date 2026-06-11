"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type DeleteClassButtonProps = {
  runId: string;
  classTitle: string;
};

export function DeleteClassButton({ runId, classTitle }: DeleteClassButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isDeleting || isPending;

  async function deleteClass() {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/parse-test?runId=${encodeURIComponent(runId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete this class.");
      }

      toast.success("Class deleted");
      setIsOpen(false);
      startTransition(() => {
        router.replace("/classes");
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this class.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setIsOpen(true)}
        disabled={isBusy}
        leadingIcon={<Trash2 className="h-4 w-4" aria-hidden />}
      >
        Delete class
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4"
          role="presentation"
          onMouseDown={() => {
            if (!isBusy) {
              setIsOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-class-title"
            className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">
                  Delete class
                </p>
                <h2 id="delete-class-title" className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  Delete {classTitle}?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isBusy}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close delete confirmation"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This removes the class, syllabus details, assignments, and calendar events. Linked notes stay in your notes workspace.
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={deleteClass} disabled={isBusy}>
                {isDeleting ? "Deleting..." : "Delete class"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
