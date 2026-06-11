"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ParseTestViewModel } from "@/lib/parse-test/contracts";
import { DeleteClassButton } from "./delete-class-button";

type ClassSettingsPanelProps = {
  preview: ParseTestViewModel;
};

function joinList(values: string[]) {
  return values.join(", ");
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullableTrim(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createReviewPayload(preview: ParseTestViewModel, form: ClassSettingsFormState) {
  return {
    runId: preview.run.id,
    course: {
      title: form.title.trim(),
      courseCode: nullableTrim(form.courseCode),
      courseSection: nullableTrim(form.courseSection),
      term: nullableTrim(form.term),
      instructorName: nullableTrim(form.instructorName),
      meetingDays: nullableTrim(form.meetingDays),
      meetingTime: nullableTrim(form.meetingTime),
      meetingLocation: nullableTrim(form.meetingLocation),
      requiredMaterials: splitList(form.requiredMaterials),
      homeworkTools: splitList(form.homeworkTools),
      catalogDescription: nullableTrim(form.catalogDescription),
      studentSummary: form.studentSummary.trim() || preview.course.studentSummary,
      descriptionSource: preview.course.descriptionSource,
    },
    concepts: preview.concepts.map((concept) => ({
      label: concept.label,
    })),
    contacts: preview.contacts.map((contact) => ({
      role: contact.role,
      name: contact.name,
      email: contact.email,
      officeHours: contact.officeHours,
      location: contact.location,
      sourceSnippet: contact.sourceSnippet,
    })),
    gradingItems: preview.gradingItems.map((item) => ({
      label: item.label,
      weightPercent: item.weightPercent,
      sourceSnippet: item.sourceSnippet,
    })),
    assignments: preview.assignments.map((assignment) => ({
      title: assignment.title,
      category: assignment.category,
      dateText: assignment.dateText,
      dueAt: assignment.dueAt,
      timeText: assignment.timeText,
      weightPercent: assignment.weightPercent,
      sourceSnippet: assignment.sourceSnippet,
    })),
    events: preview.events.map((event) => ({
      title: event.title,
      category: event.category,
      dateText: event.dateText,
      dueAt: event.dueAt,
      timeText: event.timeText,
      location: event.location,
      sourceSnippet: event.sourceSnippet,
    })),
  };
}

type ClassSettingsFormState = {
  title: string;
  courseCode: string;
  courseSection: string;
  term: string;
  instructorName: string;
  meetingDays: string;
  meetingTime: string;
  meetingLocation: string;
  requiredMaterials: string;
  homeworkTools: string;
  catalogDescription: string;
  studentSummary: string;
};

function createInitialFormState(preview: ParseTestViewModel): ClassSettingsFormState {
  return {
    title: preview.course.title,
    courseCode: preview.course.courseCode ?? "",
    courseSection: preview.course.courseSection ?? "",
    term: preview.course.term ?? "",
    instructorName: preview.course.instructorName ?? "",
    meetingDays: preview.course.meetingDays ?? "",
    meetingTime: preview.course.meetingTime ?? "",
    meetingLocation: preview.course.meetingLocation ?? "",
    requiredMaterials: joinList(preview.course.requiredMaterials),
    homeworkTools: joinList(preview.course.homeworkTools),
    catalogDescription: preview.course.catalogDescription ?? "",
    studentSummary: preview.course.studentSummary,
  };
}

export function ClassSettingsPanel({ preview }: ClassSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialFormState = useMemo(() => createInitialFormState(preview), [preview]);
  const [form, setForm] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const isBusy = isSaving || isArchiving || isPending;

  const updateField =
    (field: keyof ClassSettingsFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.currentTarget.value }));
    };

  async function saveSettings() {
    if (!form.title.trim()) {
      toast.error("Class title is required");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading("Saving class settings...", {
      duration: Infinity,
    });

    try {
      const response = await fetch("/api/parse-test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createReviewPayload(preview, form)),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not save class settings.");
      }

      toast.success("Class settings saved", { id: toastId });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error("Could not save class settings", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveClass() {
    setIsArchiving(true);
    const toastId = toast.loading("Archiving class...", {
      duration: Infinity,
    });

    try {
      const response = await fetch(`/api/classes/${preview.run.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not archive class.");
      }

      toast.success("Class archived", { id: toastId });
      startTransition(() => {
        router.replace("/classes");
        router.refresh();
      });
    } catch (error) {
      toast.error("Could not archive class", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
        duration: 5000,
      });
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[var(--radius-xl)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-base font-semibold text-foreground">Class settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the saved class details used across notes and study tools.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Title</span>
          <Input value={form.title} onChange={updateField("title")} disabled={isBusy} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            <span>Course code</span>
            <Input value={form.courseCode} onChange={updateField("courseCode")} disabled={isBusy} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            <span>Section</span>
            <Input value={form.courseSection} onChange={updateField("courseSection")} disabled={isBusy} />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Term</span>
          <Input value={form.term} onChange={updateField("term")} disabled={isBusy} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Instructor</span>
          <Input value={form.instructorName} onChange={updateField("instructorName")} disabled={isBusy} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            <span>Meeting days</span>
            <Input value={form.meetingDays} onChange={updateField("meetingDays")} disabled={isBusy} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            <span>Meeting time</span>
            <Input value={form.meetingTime} onChange={updateField("meetingTime")} disabled={isBusy} />
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Location</span>
          <Input value={form.meetingLocation} onChange={updateField("meetingLocation")} disabled={isBusy} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Required materials</span>
          <Input value={form.requiredMaterials} onChange={updateField("requiredMaterials")} disabled={isBusy} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Homework tools</span>
          <Input value={form.homeworkTools} onChange={updateField("homeworkTools")} disabled={isBusy} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Summary</span>
          <Textarea
            value={form.studentSummary}
            onChange={updateField("studentSummary")}
            rows={4}
            disabled={isBusy}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Catalog description</span>
          <Textarea
            value={form.catalogDescription}
            onChange={updateField("catalogDescription")}
            rows={4}
            disabled={isBusy}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void saveSettings()}
          disabled={isBusy}
          leadingIcon={
            isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )
          }
        >
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void archiveClass()}
          disabled={isBusy}
          leadingIcon={
            isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Archive className="h-4 w-4" aria-hidden />
            )
          }
        >
          {isArchiving ? "Archiving..." : "Archive"}
        </Button>
        <DeleteClassButton runId={preview.run.id} classTitle={preview.course.title} />
      </div>
    </section>
  );
}
