import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { getButtonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";
import { db } from "@/lib/db";
import { note, parseTestCourse, parseTestEvent, parseTestRun } from "@/lib/db/schema";
import { LiveClock } from "@/components/dashboard/live-clock";
import { TodayEventsList, type DashboardEvent } from "@/components/dashboard/event-countdown";
import { cx } from "@/lib/utils";

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CourseIcon({ courseCode }: { courseCode: string | null }) {
  const code = (courseCode ?? "").toUpperCase();
  let icon: ReactNode;

  if (/^(CS|CE|CSCE|CSCI|ECE|EE)/.test(code)) {
    icon = (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  } else if (/^(MATH|STAT|CALC)/.test(code)) {
    icon = (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  } else if (/^(PHYS|CHEM|BIO|SCI)/.test(code)) {
    icon = (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M9 3h6M9 3v7l-4 9h14L15 10V3" />
      </svg>
    );
  } else {
    icon = (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-muted-foreground">
      {icon}
    </span>
  );
}

function NoteIcon() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8" />
      </svg>
    </span>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SectionHeader({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      {action}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireServerSession("/");
  const userId = session.user.id;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [classes, recentNotes, todayEventRows] = await Promise.all([
    listUserClasses(userId),
    db
      .select({ id: note.id, title: note.title, classId: note.classId, updatedAt: note.updatedAt })
      .from(note)
      .where(eq(note.userId, userId))
      .orderBy(desc(note.updatedAt))
      .limit(10),
    db
      .select({
        id: parseTestEvent.id,
        title: parseTestEvent.title,
        category: parseTestEvent.category,
        courseTitle: parseTestCourse.title,
        courseCode: parseTestCourse.courseCode,
        dueAt: parseTestEvent.dueAt,
        timeText: parseTestEvent.timeText,
        courseId: parseTestEvent.courseId,
      })
      .from(parseTestEvent)
      .innerJoin(parseTestCourse, eq(parseTestCourse.id, parseTestEvent.courseId))
      .innerJoin(parseTestRun, eq(parseTestRun.id, parseTestCourse.runId))
      .where(
        and(
          eq(parseTestRun.userId, userId),
          gte(parseTestEvent.dueAt, todayStart),
          lt(parseTestEvent.dueAt, todayEnd),
        ),
      )
      .orderBy(asc(parseTestEvent.dueAt))
      .limit(20),
  ]);

  const upcomingEventRows = await db
    .select({
      id: parseTestEvent.id,
      title: parseTestEvent.title,
      category: parseTestEvent.category,
      dueAt: parseTestEvent.dueAt,
      courseId: parseTestEvent.courseId,
    })
    .from(parseTestEvent)
    .innerJoin(parseTestCourse, eq(parseTestCourse.id, parseTestEvent.courseId))
    .innerJoin(parseTestRun, eq(parseTestRun.id, parseTestCourse.runId))
    .where(and(eq(parseTestRun.userId, userId), gte(parseTestEvent.dueAt, new Date())))
    .orderBy(asc(parseTestEvent.dueAt));

  const nextEventByCourse = new Map<string, { title: string; category: string; dueAt: Date }>();
  for (const ev of upcomingEventRows) {
    if (!nextEventByCourse.has(ev.courseId) && ev.dueAt) {
      nextEventByCourse.set(ev.courseId, { title: ev.title, category: ev.category, dueAt: ev.dueAt });
    }
  }

  const classNameById = new Map(classes.map((c) => [c.courseId, c.title]));

  const todayEvents: DashboardEvent[] = todayEventRows.map((ev) => ({
    id: ev.id,
    title: ev.title,
    category: ev.category,
    courseTitle: ev.courseTitle,
    courseCode: ev.courseCode,
    dueAt: ev.dueAt?.toISOString() ?? null,
    timeText: ev.timeText,
  }));

  const firstName = (session.user.name ?? "").trim().split(" ")[0] ?? "";
  const greeting = firstName ? `Welcome back, ${firstName} 👋` : "Welcome back 👋";

  function formatNextEventDate(dueAt: Date): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dueAt.toDateString() === now.toDateString()) return "Today";
    if (dueAt.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return dueAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const linkClass = "text-xs font-medium text-accent transition hover:text-accent/80";
  const iconSm = "h-3.5 w-3.5";

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header — fixed height */}
      <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{greeting}</h1>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            Here&apos;s what&apos;s happening with your classes and notes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link href="/notes?new=1" className={getButtonClassName("primary")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New note
          </Link>
          <Link href="/parse-test" className={getButtonClassName("outline")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload syllabus
          </Link>
        </div>
      </div>

      {/* Main grid — fills remaining height */}
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">

        {/* Left column */}
        <div className="flex min-h-0 flex-col gap-5">

          {/* Clock — fixed height */}
          <Card className="shrink-0">
            <CardHeader className="pb-3">
              <SectionHeader
                title="Current time"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                }
              />
            </CardHeader>
            <CardContent className="pt-0">
              <LiveClock />
            </CardContent>
          </Card>

          {/* Today's events — flex-1 with internal scroll */}
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="shrink-0 pb-2">
              <SectionHeader
                title="Today's class events"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
                action={
                  <Link href="/calendar" className={linkClass}>View calendar</Link>
                }
              />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-1">
              <TodayEventsList events={todayEvents} />
            </CardContent>
          </Card>

          {/* Recent notes — flex-1 with internal scroll */}
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="shrink-0 pb-2">
              <SectionHeader
                title="Recently viewed notes"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                }
                action={
                  <Link href="/notes" className={linkClass}>View all notes</Link>
                }
              />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-1">
              {recentNotes.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">No notes yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Notes you create will appear here.</p>
                    <Link href="/notes?new=1" className={cx(getButtonClassName("primary", "sm"), "mt-4 inline-flex")}>
                      Create a note
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="-mx-1 space-y-0.5">
                  {recentNotes.map((item) => (
                    <Link
                      key={item.id}
                      href="/notes"
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-surface-muted"
                    >
                      <NoteIcon />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.classId ? (classNameById.get(item.classId) ?? "Linked class") : "Unfiled"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        <span className="text-xs">{relativeTime(item.updatedAt)}</span>
                        <ChevronRight />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — courses fills full height with internal scroll */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 pb-2">
            <SectionHeader
              title="Your courses"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconSm} aria-hidden>
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              }
              action={
                <Link href="/classes" className={linkClass}>All courses</Link>
              }
            />
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pt-1">
            {classes.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No courses yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Upload a syllabus to create your first course.</p>
                  <Link href="/parse-test" className={cx(getButtonClassName("primary", "sm"), "mt-4 inline-flex")}>
                    Upload syllabus
                  </Link>
                </div>
              </div>
            ) : (
              <div className="-mx-1 divide-y divide-border">
                {classes.map((item) => {
                  const next = nextEventByCourse.get(item.courseId);
                  return (
                    <Link
                      key={item.courseId}
                      href={`/classes/${item.runId}`}
                      className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface-muted first:rounded-t-lg last:rounded-b-lg"
                    >
                      <CourseIcon courseCode={item.courseCode} />
                      <div className="min-w-0 flex-1">
                        {item.courseCode ? (
                          <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                            {item.courseCode}
                          </p>
                        ) : null}
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.noteCount} linked note{item.noteCount === 1 ? "" : "s"}
                          {item.instructorName ? ` · ${item.instructorName}` : ""}
                        </p>
                      </div>
                      {next ? (
                        <div className="shrink-0 text-right">
                          <p className="text-[0.7rem] font-medium text-muted-foreground">Next: {next.category}</p>
                          <p className="text-xs font-semibold text-foreground">
                            {formatNextEventDate(next.dueAt)},{" "}
                            {next.dueAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      ) : (
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-muted-foreground">No upcoming</p>
                          <p className="text-xs text-muted-foreground">events</p>
                        </div>
                      )}
                      <ChevronRight />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
