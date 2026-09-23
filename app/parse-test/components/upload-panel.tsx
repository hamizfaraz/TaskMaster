import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { getButtonClassName } from "@/components/ui/button";
import { cx } from "@/lib/utils";

type UploadPanelProps = {
  selectedFileName: string | null;
  isBusy: boolean;
  statusText: string | null;
  progress: number;
  fileInputKey: number;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (formData: FormData) => Promise<void>;
  onClose: () => void;
};

export function UploadPanel({
  selectedFileName,
  isBusy,
  statusText,
  progress,
  fileInputKey,
  onFileChange,
  onSubmit,
  onClose,
}: UploadPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    void onSubmit(new FormData(event.currentTarget));
  }

  return (
    <section className="relative w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface px-4 pb-4 pt-11 shadow-[var(--shadow-card)] sm:px-5 sm:pb-5 sm:pt-12">
      <button
        type="button"
        onClick={onClose}
        disabled={isBusy}
        className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:left-4 sm:top-4"
        aria-label="Close syllabus upload"
        title="Close syllabus upload"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
      </button>

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isBusy}>
        <label
          className={cx(
            "flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface-muted px-5 py-7 text-center transition sm:min-h-44 sm:py-8",
            isBusy
              ? "cursor-not-allowed opacity-70"
              : "cursor-pointer hover:border-border-strong",
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-foreground text-background">
            {isBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-5 w-5" aria-hidden />
            )}
          </span>
          <span className="mt-4 text-base font-semibold text-foreground">
            {isBusy ? "Processing syllabus" : "Upload syllabus"}
          </span>
          <span className="mt-1 max-w-72 text-sm leading-6 text-muted-foreground">
            {isBusy ? "Keep this page open while the class is created." : "Choose a PDF to create your class."}
          </span>
          <input
            key={fileInputKey}
            className="sr-only"
            type="file"
            name="file"
            accept="application/pdf"
            disabled={isBusy}
            onChange={onFileChange}
          />
        </label>

        {selectedFileName ? (
          <div className="truncate rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-foreground">
            {selectedFileName}
          </div>
        ) : null}

        {isBusy ? (
          <div className="min-h-[3.75rem] space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
              />
            </div>
            <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
              {statusText ?? "Processing syllabus..."}
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isBusy}
          className={cx(
            getButtonClassName("primary"),
            "w-full",
            isBusy ? "bg-surface-elevated text-muted-foreground shadow-none hover:opacity-100" : "",
          )}
        >
          {isBusy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Processing syllabus...
            </>
          ) : (
            "Upload syllabus"
          )}
        </button>
      </form>
    </section>
  );
}