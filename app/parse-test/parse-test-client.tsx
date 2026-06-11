"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UploadPanel } from "./components/upload-panel";

type ParseStreamEvent =
  | { type: "start" }
  | { type: "log"; message: string }
  | { type: "result"; ok: true; isDuplicate?: boolean; runId?: string }
  | { type: "error"; error: string; status?: number };

type ParsedUpload = {
  isDuplicate: boolean;
  runId: string;
};

export function ParseTestClient() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [parsedUpload, setParsedUpload] = useState<ParsedUpload | null>(null);

  async function handleSubmit(formData: FormData) {
    setParsedUpload(null);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatusText(null);
      toast.error("Choose a syllabus PDF before starting the parse.");
      return;
    }

    setIsUploading(true);
    setProgress(12);
    setStatusText("Uploading syllabus...");

    try {
      const response = await fetch("/api/parse-test", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; logs?: string[] }
          | null;
        setStatusText(payload?.logs?.at(-1) ?? null);
        throw new Error(payload?.error || "ParseTest could not parse the uploaded syllabus.");
      }

      if (!response.body) {
        throw new Error("ParseTest did not return a readable activity stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: Extract<ParseStreamEvent, { type: "result" }> | null = null;
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const event = JSON.parse(trimmed) as ParseStreamEvent;

          if (event.type === "log") {
            setStatusText(event.message);
            setProgress((current) => Math.min(92, current + 13));
            continue;
          }

          if (event.type === "error") {
            streamError = event.error;
          }

          if (event.type === "result") {
            finalResult = event;
          }
        }
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer.trim()) as ParseStreamEvent;
        if (event.type === "log") {
          setStatusText(event.message);
          setProgress((current) => Math.min(92, current + 13));
        } else if (event.type === "error") {
          streamError = event.error;
        } else if (event.type === "result") {
          finalResult = event;
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      if (!finalResult) {
        throw new Error("ParseTest finished without a final result.");
      }

      if (!finalResult.runId) {
        throw new Error("ParseTest finished without a saved class id.");
      }

      setProgress(100);
      setStatusText("Syllabus parsed.");
      setParsedUpload({
        isDuplicate: Boolean(finalResult.isDuplicate),
        runId: finalResult.runId,
      });
    } catch (submissionError) {
      setProgress(0);
      setStatusText(null);
      toast.error(
        submissionError instanceof Error
          ? submissionError.message
          : "ParseTest hit an unexpected upload error.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFileName(file?.name ?? null);
    setStatusText(null);
    setProgress(0);
    setParsedUpload(null);
  }

  function openReview() {
    if (!parsedUpload) {
      return;
    }

    startTransition(() => {
      router.push(`/parse-test?run=${encodeURIComponent(parsedUpload.runId)}&review=1`);
      router.refresh();
    });
  }

  function importClass() {
    if (!parsedUpload) {
      return;
    }

    startTransition(() => {
      router.push(`/classes/${encodeURIComponent(parsedUpload.runId)}`);
      router.refresh();
    });
  }

  const isBusy = isUploading || isNavigating;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <UploadPanel
        selectedFileName={selectedFileName}
        isBusy={isBusy}
        statusText={statusText}
        progress={progress}
        onFileChange={handleFileChange}
        onSubmit={handleSubmit}
      />

      {parsedUpload ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="syllabus-import-title"
            className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {parsedUpload.isDuplicate ? "Syllabus already imported" : "Syllabus ready"}
            </p>
            <h2 id="syllabus-import-title" className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Import this class?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You can review and edit the parsed class details first, or import it now and make
              changes later from the class page.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" disabled={isNavigating} onClick={openReview}>
                Review / edit
              </Button>
              <Button type="button" disabled={isNavigating} onClick={importClass}>
                Import now
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
