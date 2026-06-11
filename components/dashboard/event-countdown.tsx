"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/utils";

export type DashboardEvent = {
  id: string;
  title: string;
  category: string;
  courseTitle: string;
  courseCode: string | null;
  dueAt: string | null;
  timeText: string | null;
};

function getCountdown(dueTime: number, nowTime: number): string {
  const diff = dueTime - nowTime;
  if (diff <= 0) return "Now";
  const totalMins = Math.floor(diff / 60000);
  if (totalMins < 60) return `in ${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  return "Today";
}

function CategoryIcon({ category }: { category: string }) {
  const cat = category.toLowerCase();
  if (cat.includes("lecture") || cat.includes("class")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    );
  }
  if (cat.includes("office") || cat.includes("hour")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (cat.includes("lab")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M9 3h6M9 3v7l-4 9h14L15 10V3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function EventRow({ event }: { event: DashboardEvent }) {
  const [nowTime, setNowTime] = useState<number | null>(null);

  useEffect(() => {
    if (!event.dueAt) return;
    const updateNow = () => setNowTime(Date.now());
    const timeoutId = window.setTimeout(updateNow, 0);
    const intervalId = window.setInterval(updateNow, 30000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [event.dueAt]);

  const dueTime = event.dueAt ? new Date(event.dueAt).getTime() : null;
  const countdown = dueTime !== null && nowTime !== null ? getCountdown(dueTime, nowTime) : "";
  const isPast = dueTime !== null && nowTime !== null ? dueTime < nowTime : false;
  const isDue = event.category.toLowerCase().includes("assign") || event.category.toLowerCase().includes("due") || event.category.toLowerCase().includes("exam") || event.category.toLowerCase().includes("quiz");

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-surface-muted">
      <div className="flex w-16 shrink-0 flex-col text-right text-[0.7rem] leading-tight text-muted-foreground">
        {event.timeText ? (
          event.timeText.split(/[-–]/).map((t, i) => <span key={i}>{t.trim()}</span>)
        ) : (
          <span>All day</span>
        )}
      </div>

      <span className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        isDue
          ? "bg-danger/10 text-danger"
          : "bg-surface-elevated text-muted-foreground",
      )}>
        <CategoryIcon category={event.category} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {event.category}
          {event.courseCode ? ` · ${event.courseCode}` : ""}
        </p>
      </div>

      <span className={cx(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[0.68rem] font-medium",
        isPast
          ? "bg-surface-elevated text-muted-foreground"
          : isDue
          ? "bg-danger/10 text-danger"
          : "bg-accent-soft text-accent",
      )}>
        {isPast ? "Past" : isDue ? "Due today" : countdown}
      </span>
    </div>
  );
}

export function TodayEventsList({ events }: { events: DashboardEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No events scheduled for today.
      </p>
    );
  }

  return (
    <div className="-mx-1 space-y-0.5">
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
