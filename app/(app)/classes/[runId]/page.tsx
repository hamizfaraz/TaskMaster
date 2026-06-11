import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getButtonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { getParseTestViewModelForRun } from "@/lib/parse-test/service";
import { ClassSettingsPanel } from "./class-settings-panel";

type ScheduleItem = {
  id: string;
  title: string;
  category: string;
  dateText: string;
  dueAt: string | null;
  timeText: string | null;
};

type UpcomingClassItem = ScheduleItem & {
  kind: "Assignment" | "Event";
};

function formatTimestamp(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getScheduleTime(value: ScheduleItem) {
  return new Date(value.dueAt ?? "9999-12-31T00:00:00.000Z").getTime();
}

function getUpcomingClassItems(
  assignments: ScheduleItem[],
  events: ScheduleItem[],
): UpcomingClassItem[] {
  const now = Date.now();
  const items: UpcomingClassItem[] = [
    ...assignments.map((assignment) => ({
      ...assignment,
      kind: "Assignment" as const,
    })),
    ...events.map((event) => ({
      ...event,
      kind: "Event" as const,
    })),
  ];

  const upcoming = items
    .filter((item) => !item.dueAt || getScheduleTime(item) >= now)
    .sort((left, right) => getScheduleTime(left) - getScheduleTime(right));

  return (upcoming.length > 0
    ? upcoming
    : items.sort((left, right) => getScheduleTime(right) - getScheduleTime(left))
  ).slice(0, 6);
}

export default async function ClassDetailPage(props: {
  params: Promise<{ runId: string }>;
}) {
  const session = await requireServerSession("/classes");
  const { runId } = await props.params;
  const preview = await getParseTestViewModelForRun(session.user.id, runId);

  if (!preview) {
    notFound();
  }

  const classNotes = await db
    .select({
      id: note.id,
      title: note.title,
      sourceType: note.sourceType,
      fileName: note.fileName,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .where(and(eq(note.userId, session.user.id), eq(note.classId, preview.course.id)))
    .orderBy(desc(note.updatedAt));
  const upcomingClassItems = getUpcomingClassItems(preview.assignments, preview.events);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <Link href="/classes" className={getButtonClassName("ghost", "sm")}>
          Classes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {preview.course.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {preview.course.courseCode ? (
                <Badge variant="accent">{preview.course.courseCode}</Badge>
              ) : null}
              {preview.course.courseSection ? (
                <Badge variant="outline">Section {preview.course.courseSection}</Badge>
              ) : null}
              {preview.course.term ? <Badge variant="outline">{preview.course.term}</Badge> : null}
              <Badge variant="outline">
                {classNotes.length} linked note{classNotes.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/notes?classId=${preview.course.id}&new=1`}
              className={getButtonClassName("primary")}
            >
              New note
            </Link>
            <Link
              href={`/notes?classId=${preview.course.id}`}
              className={getButtonClassName("outline")}
            >
              Notes
            </Link>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <main className="min-w-0 space-y-4">
            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Class information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Instructor:</span>{" "}
                    {preview.course.instructorName ?? "Not extracted yet"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Schedule:</span>{" "}
                    {[preview.course.meetingDays, preview.course.meetingTime]
                      .filter(Boolean)
                      .join(" ") || "Not extracted yet"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Location:</span>{" "}
                    {preview.course.meetingLocation ?? "Not extracted yet"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Updated:</span>{" "}
                    {formatTimestamp(preview.run.updatedAt)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Materials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Required</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {preview.course.requiredMaterials.length > 0 ? (
                        preview.course.requiredMaterials.map((material) => (
                          <Badge key={material} variant="outline">
                            {material}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">None extracted yet.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Tools</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {preview.course.homeworkTools.length > 0 ? (
                        preview.course.homeworkTools.map((tool) => (
                          <Badge key={tool} variant="accent">
                            {tool}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">None extracted yet.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {upcomingClassItems.length > 0 ? (
                  upcomingClassItems.map((item) => (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-4 py-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant={item.kind === "Assignment" ? "accent" : "outline"}>
                          {item.kind}
                        </Badge>
                        <Badge variant="outline">{item.category}</Badge>
                      </div>
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDate(item.dueAt, item.dateText)}
                        {item.timeText ? ` · ${item.timeText}` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming work parsed yet.</p>
                )}
              </CardContent>
            </Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Contacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.contacts.length > 0 ? (
                    preview.contacts.map((contact) => (
                      <div key={contact.id} className="rounded-lg border border-border bg-surface-muted p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="accent">{contact.role}</Badge>
                        </div>
                        <p className="text-sm font-medium text-foreground">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.email ?? "Email not extracted"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {contact.officeHours ?? "Office hours not extracted"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No contacts parsed yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Grading</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.gradingItems.length > 0 ? (
                    preview.gradingItems.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-foreground">{item.label}</span>
                          <span className="text-muted-foreground">{item.weightPercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${item.weightPercent}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No grading items parsed yet.</p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Assignments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.assignments.length > 0 ? (
                    preview.assignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-lg border border-border bg-surface-muted p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{assignment.title}</p>
                            <p className="text-xs text-muted-foreground">{assignment.category}</p>
                          </div>
                          <Badge variant="outline">{formatDate(assignment.dueAt, assignment.dateText)}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No assignments parsed yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendar events</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.events.length > 0 ? (
                    preview.events.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border bg-surface-muted p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{event.title}</p>
                            <p className="text-xs text-muted-foreground">{event.category}</p>
                          </div>
                          <Badge variant="outline">{formatDate(event.dueAt, event.dateText)}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No events parsed yet.</p>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Linked notes</CardTitle>
              </CardHeader>
              <CardContent>
                {classNotes.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {classNotes.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border bg-surface-muted p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {item.sourceType === "upload" ? "Imported file" : "Manual note"}
                          </Badge>
                          {item.fileName ? <Badge variant="accent">{item.fileName}</Badge> : null}
                        </div>
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Updated {formatTimestamp(item.updatedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    eyebrow="Notes"
                    title="No notes linked yet"
                    description="Create a note for this class or link existing notes from the notes workspace."
                    action={
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/notes?classId=${preview.course.id}&new=1`}
                          className={getButtonClassName("primary")}
                        >
                          New note
                        </Link>
                        <Link
                          href={`/notes?classId=${preview.course.id}`}
                          className={getButtonClassName("outline")}
                        >
                          Link notes
                        </Link>
                      </div>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </main>

          <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
            <ClassSettingsPanel preview={preview} />
          </aside>
        </div>
      </div>
    </div>
  );
}
