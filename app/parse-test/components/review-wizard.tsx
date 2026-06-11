"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, getButtonClassName } from "@/components/ui/button";
import type { ParseTestViewModel } from "@/lib/parse-test/contracts";
import { cx } from "@/lib/utils";

type ReviewWizardProps = {
  preview: ParseTestViewModel;
};

type ContactDraft = {
  role: string;
  name: string;
  email: string;
  officeHours: string;
  location: string;
  sourceSnippet: string;
};

type GradingDraft = {
  label: string;
  weightPercent: string;
  sourceSnippet: string;
};

type AssignmentDraft = {
  title: string;
  category: string;
  dateText: string;
  dueAt: string;
  timeText: string;
  weightPercent: string;
  sourceSnippet: string;
};

type EventDraft = {
  title: string;
  category: string;
  dateText: string;
  dueAt: string;
  timeText: string;
  location: string;
  sourceSnippet: string;
};

type ReviewDraft = {
  course: {
    title: string;
    courseCode: string;
    courseSection: string;
    term: string;
    instructorName: string;
    meetingDays: string;
    meetingTime: string;
    meetingLocation: string;
    catalogDescription: string;
    studentSummary: string;
    descriptionSource: ParseTestViewModel["course"]["descriptionSource"];
  };
  materialsText: string;
  toolsText: string;
  conceptsText: string;
  contacts: ContactDraft[];
  gradingItems: GradingDraft[];
  assignments: AssignmentDraft[];
  events: EventDraft[];
};

const REVIEW_STEPS = ["Course", "Resources", "People", "Grading", "Schedule"] as const;
const MANUAL_SOURCE = "Added during manual syllabus review.";

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toPercent(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createDraft(preview: ParseTestViewModel): ReviewDraft {
  return {
    course: {
      title: preview.course.title,
      courseCode: preview.course.courseCode ?? "",
      courseSection: preview.course.courseSection ?? "",
      term: preview.course.term ?? "",
      instructorName: preview.course.instructorName ?? "",
      meetingDays: preview.course.meetingDays ?? "",
      meetingTime: preview.course.meetingTime ?? "",
      meetingLocation: preview.course.meetingLocation ?? "",
      catalogDescription: preview.course.catalogDescription ?? "",
      studentSummary: preview.course.studentSummary,
      descriptionSource: preview.course.descriptionSource,
    },
    materialsText: preview.course.requiredMaterials.join("\n"),
    toolsText: preview.course.homeworkTools.join("\n"),
    conceptsText: preview.concepts.map((concept) => concept.label).join("\n"),
    contacts: preview.contacts.map((contact) => ({
      role: contact.role,
      name: contact.name,
      email: contact.email ?? "",
      officeHours: contact.officeHours ?? "",
      location: contact.location ?? "",
      sourceSnippet: contact.sourceSnippet || MANUAL_SOURCE,
    })),
    gradingItems: preview.gradingItems.map((item) => ({
      label: item.label,
      weightPercent: String(item.weightPercent),
      sourceSnippet: item.sourceSnippet || MANUAL_SOURCE,
    })),
    assignments: preview.assignments.map((assignment) => ({
      title: assignment.title,
      category: assignment.category,
      dateText: assignment.dateText,
      dueAt: toDateInput(assignment.dueAt),
      timeText: assignment.timeText ?? "",
      weightPercent: assignment.weightPercent == null ? "" : String(assignment.weightPercent),
      sourceSnippet: assignment.sourceSnippet || MANUAL_SOURCE,
    })),
    events: preview.events.map((event) => ({
      title: event.title,
      category: event.category,
      dateText: event.dateText,
      dueAt: toDateInput(event.dueAt),
      timeText: event.timeText ?? "",
      location: event.location ?? "",
      sourceSnippet: event.sourceSnippet || MANUAL_SOURCE,
    })),
  };
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date" | "email";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function updateAt<T>(items: T[], index: number, next: Partial<T>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

export function ReviewWizard({ preview }: ReviewWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => createDraft(preview));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentStep = REVIEW_STEPS[step];
  const isLastStep = step === REVIEW_STEPS.length - 1;
  const scheduleCount = draft.assignments.length + draft.events.length;
  const summary = useMemo(
    () => [
      `${draft.contacts.length} contact${draft.contacts.length === 1 ? "" : "s"}`,
      `${draft.gradingItems.length} grading item${draft.gradingItems.length === 1 ? "" : "s"}`,
      `${scheduleCount} calendar item${scheduleCount === 1 ? "" : "s"}`,
    ].join(" / "),
    [draft.contacts.length, draft.gradingItems.length, scheduleCount],
  );

  function updateCourse(next: Partial<ReviewDraft["course"]>) {
    setDraft((current) => ({ ...current, course: { ...current.course, ...next } }));
  }

  async function saveReview() {
    setError(null);
    setIsSaving(true);

    const payload = {
      runId: preview.run.id,
      course: {
        title: draft.course.title,
        courseCode: nullableText(draft.course.courseCode),
        courseSection: nullableText(draft.course.courseSection),
        term: nullableText(draft.course.term),
        instructorName: nullableText(draft.course.instructorName),
        meetingDays: nullableText(draft.course.meetingDays),
        meetingTime: nullableText(draft.course.meetingTime),
        meetingLocation: nullableText(draft.course.meetingLocation),
        requiredMaterials: splitLines(draft.materialsText),
        homeworkTools: splitLines(draft.toolsText),
        catalogDescription: nullableText(draft.course.catalogDescription),
        studentSummary: draft.course.studentSummary.trim() || "Course details reviewed from the uploaded syllabus.",
        descriptionSource: draft.course.descriptionSource,
      },
      concepts: splitLines(draft.conceptsText).map((label) => ({ label })),
      contacts: draft.contacts
        .filter((contact) => contact.name.trim())
        .map((contact) => ({
          role: contact.role.trim() || "Contact",
          name: contact.name.trim(),
          email: nullableText(contact.email),
          officeHours: nullableText(contact.officeHours),
          location: nullableText(contact.location),
          sourceSnippet: contact.sourceSnippet.trim() || MANUAL_SOURCE,
        })),
      gradingItems: draft.gradingItems
        .filter((item) => item.label.trim())
        .map((item) => ({
          label: item.label.trim(),
          weightPercent: toPercent(item.weightPercent) ?? 0,
          sourceSnippet: item.sourceSnippet.trim() || MANUAL_SOURCE,
        })),
      assignments: draft.assignments
        .filter((assignment) => assignment.title.trim())
        .map((assignment) => ({
          title: assignment.title.trim(),
          category: assignment.category.trim() || "Assignment",
          dateText: assignment.dateText.trim() || assignment.dueAt || "Date pending",
          dueAt: nullableText(assignment.dueAt),
          timeText: nullableText(assignment.timeText),
          weightPercent: assignment.weightPercent.trim() ? toPercent(assignment.weightPercent) : null,
          sourceSnippet: assignment.sourceSnippet.trim() || MANUAL_SOURCE,
        })),
      events: draft.events
        .filter((event) => event.title.trim())
        .map((event) => ({
          title: event.title.trim(),
          category: event.category.trim() || "Event",
          dateText: event.dateText.trim() || event.dueAt || "Date pending",
          dueAt: nullableText(event.dueAt),
          timeText: nullableText(event.timeText),
          location: nullableText(event.location),
          sourceSnippet: event.sourceSnippet.trim() || MANUAL_SOURCE,
        })),
    };

    try {
      const response = await fetch("/api/parse-test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Review values could not be saved.");
        return;
      }

      startTransition(() => {
        router.push(`/classes/${encodeURIComponent(preview.run.id)}`);
        router.refresh();
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="min-h-0 rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Review parsed values
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {draft.course.title || "Untitled course"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
          </div>
          <Link href={`/classes/${preview.run.id}`} className={getButtonClassName("outline", "sm")}>
            Quick add
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {REVIEW_STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className={cx(
                "h-2 rounded-full transition",
                index <= step ? "bg-accent" : "bg-surface-elevated",
              )}
              aria-label={`Go to ${label} review step`}
              aria-current={index === step ? "step" : undefined}
            />
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-5">
        {currentStep === "Course" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Class name" value={draft.course.title} onChange={(title) => updateCourse({ title })} />
            <TextField label="Course number" value={draft.course.courseCode} onChange={(courseCode) => updateCourse({ courseCode })} />
            <TextField label="Section" value={draft.course.courseSection} onChange={(courseSection) => updateCourse({ courseSection })} />
            <TextField label="Term" value={draft.course.term} onChange={(term) => updateCourse({ term })} />
            <TextField label="Instructor" value={draft.course.instructorName} onChange={(instructorName) => updateCourse({ instructorName })} />
            <TextField label="Meeting days" value={draft.course.meetingDays} onChange={(meetingDays) => updateCourse({ meetingDays })} />
            <TextField label="Meeting time" value={draft.course.meetingTime} onChange={(meetingTime) => updateCourse({ meetingTime })} />
            <TextField label="Location" value={draft.course.meetingLocation} onChange={(meetingLocation) => updateCourse({ meetingLocation })} />
            <div className="md:col-span-2">
              <TextArea label="Student summary" value={draft.course.studentSummary} onChange={(studentSummary) => updateCourse({ studentSummary })} />
            </div>
            <div className="md:col-span-2">
              <TextArea label="Catalog description" value={draft.course.catalogDescription} onChange={(catalogDescription) => updateCourse({ catalogDescription })} />
            </div>
          </div>
        ) : null}

        {currentStep === "Resources" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea label="Required materials" value={draft.materialsText} onChange={(value) => setDraft((current) => ({ ...current, materialsText: value }))} rows={8} />
            <TextArea label="Homework tools" value={draft.toolsText} onChange={(value) => setDraft((current) => ({ ...current, toolsText: value }))} rows={8} />
            <div className="md:col-span-2">
              <TextArea label="Key concepts" value={draft.conceptsText} onChange={(value) => setDraft((current) => ({ ...current, conceptsText: value }))} rows={6} />
            </div>
          </div>
        ) : null}

        {currentStep === "People" ? (
          <div className="space-y-3">
            {draft.contacts.map((contact, index) => (
              <div key={index} className="rounded-[var(--radius-lg)] border border-border bg-surface-muted p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Role" value={contact.role} onChange={(role) => setDraft((current) => ({ ...current, contacts: updateAt(current.contacts, index, { role }) }))} />
                  <TextField label="Name" value={contact.name} onChange={(name) => setDraft((current) => ({ ...current, contacts: updateAt(current.contacts, index, { name }) }))} />
                  <TextField label="Email" type="email" value={contact.email} onChange={(email) => setDraft((current) => ({ ...current, contacts: updateAt(current.contacts, index, { email }) }))} />
                  <TextField label="Location" value={contact.location} onChange={(location) => setDraft((current) => ({ ...current, contacts: updateAt(current.contacts, index, { location }) }))} />
                  <div className="md:col-span-2">
                    <TextField label="Office hours" value={contact.officeHours} onChange={(officeHours) => setDraft((current) => ({ ...current, contacts: updateAt(current.contacts, index, { officeHours }) }))} />
                  </div>
                </div>
                <button type="button" className={cx(getButtonClassName("ghost", "sm"), "mt-3")} onClick={() => setDraft((current) => ({ ...current, contacts: removeAt(current.contacts, index) }))}>
                  Remove contact
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setDraft((current) => ({ ...current, contacts: current.contacts.concat({ role: "Instructor", name: "", email: "", officeHours: "", location: "", sourceSnippet: MANUAL_SOURCE }) }))}>
              Add contact
            </Button>
          </div>
        ) : null}

        {currentStep === "Grading" ? (
          <div className="space-y-3">
            {draft.gradingItems.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-muted p-4 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <TextField label="Category" value={item.label} onChange={(label) => setDraft((current) => ({ ...current, gradingItems: updateAt(current.gradingItems, index, { label }) }))} />
                <TextField label="Percent" type="number" value={item.weightPercent} onChange={(weightPercent) => setDraft((current) => ({ ...current, gradingItems: updateAt(current.gradingItems, index, { weightPercent }) }))} />
                <button type="button" className={cx(getButtonClassName("ghost", "sm"), "self-end")} onClick={() => setDraft((current) => ({ ...current, gradingItems: removeAt(current.gradingItems, index) }))}>
                  Remove
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setDraft((current) => ({ ...current, gradingItems: current.gradingItems.concat({ label: "", weightPercent: "0", sourceSnippet: MANUAL_SOURCE }) }))}>
              Add grading item
            </Button>
          </div>
        ) : null}

        {currentStep === "Schedule" ? (
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Assignments</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft((current) => ({ ...current, assignments: current.assignments.concat({ title: "", category: "Assignment", dateText: "", dueAt: "", timeText: "", weightPercent: "", sourceSnippet: MANUAL_SOURCE }) }))}>
                  Add assignment
                </Button>
              </div>
              <div className="space-y-3">
                {draft.assignments.map((assignment, index) => (
                  <div key={index} className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-muted p-4 md:grid-cols-2">
                    <TextField label="Title" value={assignment.title} onChange={(title) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { title }) }))} />
                    <TextField label="Category" value={assignment.category} onChange={(category) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { category }) }))} />
                    <TextField label="Date text" value={assignment.dateText} onChange={(dateText) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { dateText }) }))} />
                    <TextField label="Date" type="date" value={assignment.dueAt} onChange={(dueAt) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { dueAt }) }))} />
                    <TextField label="Time" value={assignment.timeText} onChange={(timeText) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { timeText }) }))} />
                    <TextField label="Weight" type="number" value={assignment.weightPercent} onChange={(weightPercent) => setDraft((current) => ({ ...current, assignments: updateAt(current.assignments, index, { weightPercent }) }))} />
                    <button type="button" className={cx(getButtonClassName("ghost", "sm"), "md:col-span-2 justify-self-start")} onClick={() => setDraft((current) => ({ ...current, assignments: removeAt(current.assignments, index) }))}>
                      Remove assignment
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">Calendar events</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setDraft((current) => ({ ...current, events: current.events.concat({ title: "", category: "Event", dateText: "", dueAt: "", timeText: "", location: "", sourceSnippet: MANUAL_SOURCE }) }))}>
                  Add event
                </Button>
              </div>
              <div className="space-y-3">
                {draft.events.map((event, index) => (
                  <div key={index} className="grid gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-muted p-4 md:grid-cols-2">
                    <TextField label="Title" value={event.title} onChange={(title) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { title }) }))} />
                    <TextField label="Category" value={event.category} onChange={(category) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { category }) }))} />
                    <TextField label="Date text" value={event.dateText} onChange={(dateText) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { dateText }) }))} />
                    <TextField label="Date" type="date" value={event.dueAt} onChange={(dueAt) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { dueAt }) }))} />
                    <TextField label="Time" value={event.timeText} onChange={(timeText) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { timeText }) }))} />
                    <TextField label="Location" value={event.location} onChange={(location) => setDraft((current) => ({ ...current, events: updateAt(current.events, index, { location }) }))} />
                    <button type="button" className={cx(getButtonClassName("ghost", "sm"), "md:col-span-2 justify-self-start")} onClick={() => setDraft((current) => ({ ...current, events: removeAt(current.events, index) }))}>
                      Remove event
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="text-sm text-muted-foreground" aria-live="polite">
          {error ?? `Step ${step + 1} of ${REVIEW_STEPS.length}: ${currentStep}`}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={step === 0 || isPending || isSaving} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            Back
          </Button>
          {isLastStep ? (
            <Button type="button" disabled={isPending || isSaving} onClick={saveReview}>
              {isPending || isSaving ? "Saving..." : "Add class"}
            </Button>
          ) : (
            <Button type="button" disabled={isPending || isSaving} onClick={() => setStep((current) => Math.min(REVIEW_STEPS.length - 1, current + 1))}>
              Next
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
