import type { ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { getButtonClassName } from "@/components/ui/button";
import { cx } from "@/lib/utils";

type UploadPanelProps = {
  selectedFileName: string | null;
  isBusy: boolean;
  statusText: string | null;
  progress: number;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (formData: FormData) => Promise<void>;
};

export function UploadPanel({
  selectedFileName,
  isBusy,
  statusText,
  progress,
  onFileChange,
  onSubmit,
}: UploadPanelProps) {
  return (
    <section className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <form action={onSubmit} className="space-y-4">
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface-muted px-5 py-8 text-center transition hover:border-border-strong">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-foreground text-background">
            <Upload className="h-5 w-5" aria-hidden />
          </span>
          <span className="mt-4 text-base font-semibold text-foreground">
            Upload syllabus
          </span>
          <span className="mt-1 max-w-72 text-sm leading-6 text-muted-foreground">
            Choose a PDF to create your class.
          </span>
          <input
            className="sr-only"
            type="file"
            name="file"
            accept="application/pdf"
            onChange={onFileChange}
          />
        </label>

        {selectedFileName ? (
          <div className="truncate rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-foreground">
            {selectedFileName}
          </div>
        ) : null}

        {isBusy ? (
          <div className="space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {statusText ?? "Processing syllabus..."}
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isBusy}
          className={cx(getButtonClassName("primary"), "w-full")}
        >
          {isBusy ? "Uploading..." : "Upload syllabus"}
        </button>
      </form>
    </section>
  );
}
