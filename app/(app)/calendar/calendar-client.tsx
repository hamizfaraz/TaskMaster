"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/lib/utils";

export type CalendarEvent = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  category: string;
  dateText: string;
  dueAt: string | null;
  timeText: string | null;
  location: string | null;
};

type CalendarClientProps = {
  events: CalendarEvent[];
  initialDate: string;
};

type CalendarDay = {
  date: Date;
  key: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

type ClassColor = {
  chip: string;
  count: string;
  stripe: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const CLASS_COLOR_PALETTE: ClassColor[] = [
  {
    chip: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200",
    count: "bg-sky-50 text-sky-800 shadow-[inset_0_0_0_1px_rgb(186_230_253)] dark:bg-sky-950/40 dark:text-sky-200 dark:shadow-[inset_0_0_0_1px_rgb(12_74_110)]",
    stripe: "bg-sky-500",
  },
  {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200",
    count: "bg-emerald-50 text-emerald-800 shadow-[inset_0_0_0_1px_rgb(167_243_208)] dark:bg-emerald-950/40 dark:text-emerald-200 dark:shadow-[inset_0_0_0_1px_rgb(6_78_59)]",
    stripe: "bg-emerald-500",
  },
  {
    chip: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200",
    count: "bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_rgb(253_230_138)] dark:bg-amber-950/40 dark:text-amber-200 dark:shadow-[inset_0_0_0_1px_rgb(120_53_15)]",
    stripe: "bg-amber-500",
  },
  {
    chip: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200",
    count: "bg-rose-50 text-rose-800 shadow-[inset_0_0_0_1px_rgb(254_205_211)] dark:bg-rose-950/40 dark:text-rose-200 dark:shadow-[inset_0_0_0_1px_rgb(136_19_55)]",
    stripe: "bg-rose-500",
  },
  {
    chip: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-200",
    count: "bg-violet-50 text-violet-800 shadow-[inset_0_0_0_1px_rgb(221_214_254)] dark:bg-violet-950/40 dark:text-violet-200 dark:shadow-[inset_0_0_0_1px_rgb(76_29_149)]",
    stripe: "bg-violet-500",
  },
  {
    chip: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200",
    count: "bg-cyan-50 text-cyan-800 shadow-[inset_0_0_0_1px_rgb(165_243_252)] dark:bg-cyan-950/40 dark:text-cyan-200 dark:shadow-[inset_0_0_0_1px_rgb(22_78_99)]",
    stripe: "bg-cyan-500",
  },
];
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const RECURRING_EVENT_PATTERN =
  /\b(recurring|weekly|daily|every|each|lecture|lab|seminar|class meeting|meets?)\b/i;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEventDateKey(event: CalendarEvent) {
  if (!event.dueAt) {
    return null;
  }

  const date = new Date(event.dueAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date) {
  return MONTH_LABEL_FORMATTER.format(date);
}

function formatLongDate(date: Date) {
  return LONG_DATE_FORMATTER.format(date);
}

function formatEventDate(event: CalendarEvent) {
  if (!event.dueAt) {
    return event.dateText;
  }

  return EVENT_DATE_FORMATTER.format(new Date(event.dueAt));
}

function buildCalendarDays(monthDate: Date, todayKey: string) {
  const monthStart = startOfMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index): CalendarDay => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = getLocalDateKey(date);

    return {
      date,
      key,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
      isToday: key === todayKey,
    };
  });
}

function isRecurringEvent(event: CalendarEvent) {
  return RECURRING_EVENT_PATTERN.test(
    [event.title, event.category, event.dateText].join(" "),
  );
}

function EventDialog({
  event,
  color,
  onClose,
}: {
  event: CalendarEvent;
  color: ClassColor;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/55 px-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-title"
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("h-2.5 w-2.5 rounded-full", color.stripe)} aria-hidden />
              <span className={cx("rounded-full border px-2 py-0.5 text-xs font-semibold", color.chip)}>
                {event.courseTitle}
              </span>
              <Badge variant="outline">{event.category}</Badge>
            </div>
            <h2
              id="calendar-event-title"
              className="mt-3 text-xl font-semibold tracking-tight text-foreground"
            >
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground transition hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            aria-label="Close event details"
          >
            x
          </button>
        </div>

        <dl className="mt-5 grid gap-3 text-sm">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Date
            </dt>
            <dd className="mt-1 font-medium text-foreground">{formatEventDate(event)}</dd>
          </div>
          {event.timeText ? (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Time
              </dt>
              <dd className="mt-1 font-medium text-foreground">{event.timeText}</dd>
            </div>
          ) : null}
          {event.location ? (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface-muted px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Location
              </dt>
              <dd className="mt-1 font-medium text-foreground">{event.location}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-4 w-4", direction === "left" && "rotate-180")}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CalendarClient({ events, initialDate }: CalendarClientProps) {
  const today = useMemo(() => new Date(initialDate), [initialDate]);
  const todayKey = useMemo(() => getLocalDateKey(today), [today]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [showRecurring, setShowRecurring] = useState(true);
  const visibleEvents = useMemo(
    () => (showRecurring ? events : events.filter((event) => !isRecurringEvent(event))),
    [events, showRecurring],
  );
  const recurringEventCount = useMemo(
    () => events.filter((event) => isRecurringEvent(event)).length,
    [events],
  );
  const days = useMemo(
    () => buildCalendarDays(visibleMonth, todayKey),
    [todayKey, visibleMonth],
  );
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const key = getEventDateKey(event);
      if (!key) {
        continue;
      }
      const dateEvents = grouped.get(key);
      if (dateEvents) {
        dateEvents.push(event);
      } else {
        grouped.set(key, [event]);
      }
    }
    return grouped;
  }, [visibleEvents]);
  const colorByCourseId = useMemo(() => {
    const courseIds = Array.from(new Set(events.map((event) => event.courseId))).sort();
    return new Map(
      courseIds.map((courseId, index) => [
        courseId,
        CLASS_COLOR_PALETTE[index % CLASS_COLOR_PALETTE.length],
      ]),
    );
  }, [events]);
  const activeEvent = useMemo(
    () => events.find((event) => event.id === activeEventId) ?? null,
    [activeEventId, events],
  );
  const eventsThisMonth = days.reduce(
    (count, day) =>
      count + (day.isCurrentMonth ? (eventsByDate.get(day.key)?.length ?? 0) : 0),
    0,
  );

  function moveVisibleMonth(amount: number) {
    const next = addMonths(visibleMonth, amount);
    setVisibleMonth(next);
    setSelectedKey(getLocalDateKey(next));
  }

  function getClassColor(courseId: string) {
    return colorByCourseId.get(courseId) ?? CLASS_COLOR_PALETTE[0];
  }

  function openEvent(event: CalendarEvent) {
    const eventKey = getEventDateKey(event);
    if (eventKey) {
      setSelectedKey(eventKey);
    }
    setActiveEventId(event.id);
  }

  useEffect(() => {
    if (!activeEventId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveEventId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEventId]);

  return (
    <div className="h-full min-h-0">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="shrink-0 flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Month view
            </p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              {formatMonthLabel(visibleMonth)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground">
              <input
                type="checkbox"
                checked={showRecurring}
                onChange={(event) => setShowRecurring(event.currentTarget.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Recurring
              {recurringEventCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {recurringEventCount}
                </span>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => moveVisibleMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              aria-label="Previous month"
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              onClick={() => {
                const current = startOfMonth(new Date());
                setVisibleMonth(current);
                setSelectedKey(getLocalDateKey(new Date()));
              }}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-muted px-3 text-sm font-medium text-foreground transition hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => moveVisibleMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              aria-label="Next month"
            >
              <Chevron direction="right" />
            </button>
          </div>
        </div>

        <div className="shrink-0 grid grid-cols-7 border-b border-border bg-surface-muted/55">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-2 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
          {days.map((day, index) => {
            const dayEvents = eventsByDate.get(day.key) ?? [];
            const selected = selectedKey === day.key;

            return (
              <div
                key={day.key}
                className={cx(
                  "min-h-0 overflow-hidden border-b border-border p-1.5 transition",
                  index % 7 !== 6 && "border-r",
                  !day.isCurrentMonth && "bg-surface-muted/35 text-muted-foreground",
                  selected && "bg-accent-soft",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(day.key)}
                  className="flex w-full items-center justify-between gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                  aria-pressed={selected}
                  aria-label={`${formatLongDate(day.date)}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                >
                  <span
                    className={cx(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium",
                      day.isToday && "bg-foreground text-background",
                      selected &&
                        !day.isToday &&
                        "bg-surface text-accent shadow-[inset_0_0_0_1px_var(--border)]",
                    )}
                  >
                    {day.dayNumber}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className={cx("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", getClassColor(dayEvents[0].courseId).count)}>
                      {dayEvents.length}
                    </span>
                  ) : null}
                </button>

                <div className="mt-1.5 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => openEvent(event)}
                      className={cx(
                        "block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[0.65rem] font-medium transition hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
                        getClassColor(event.courseId).chip,
                      )}
                    >
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 ? (
                    <div className="px-1.5 text-[0.65rem] font-medium text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            {eventsThisMonth} event{eventsThisMonth === 1 ? "" : "s"} this month
          </span>
          <span>
            {visibleEvents.length} visible of {events.length} parsed event{events.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>
      {activeEvent ? (
        <EventDialog
          event={activeEvent}
          color={getClassColor(activeEvent.courseId)}
          onClose={() => setActiveEventId(null)}
        />
      ) : null}
    </div>
  );
}
