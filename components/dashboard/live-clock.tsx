"use client";

import { useEffect, useState } from "react";

function ClockFace({ now }: { now: Date }) {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();

  const secondDeg = s * 6;
  const minuteDeg = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  const handX = (angle: number, len: number) =>
    50 + len * Math.sin((angle * Math.PI) / 180);
  const handY = (angle: number, len: number) =>
    50 - len * Math.cos((angle * Math.PI) / 180);

  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" aria-hidden>
      <circle
        cx="50" cy="50" r="46"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-border"
        strokeDasharray="2 5"
      />
      {[...Array(12)].map((_, i) => {
        const a = i * 30;
        const ox = 50 + 38 * Math.sin((a * Math.PI) / 180);
        const oy = 50 - 38 * Math.cos((a * Math.PI) / 180);
        return (
          <circle key={i} cx={ox} cy={oy} r="1.5" className="fill-border" />
        );
      })}
      <line
        x1="50" y1="50"
        x2={handX(hourDeg, 24)} y2={handY(hourDeg, 24)}
        className="stroke-foreground"
        strokeWidth="3.5" strokeLinecap="round"
      />
      <line
        x1="50" y1="50"
        x2={handX(minuteDeg, 34)} y2={handY(minuteDeg, 34)}
        className="stroke-foreground"
        strokeWidth="2.5" strokeLinecap="round"
      />
      <line
        x1="50" y1="50"
        x2={handX(secondDeg, 36)} y2={handY(secondDeg, 36)}
        className="stroke-accent"
        strokeWidth="1.5" strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="2.5" className="fill-foreground" />
    </svg>
  );
}

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const timeoutId = window.setTimeout(updateNow, 0);
    const intervalId = window.setInterval(updateNow, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  if (!now) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="h-14 w-40 animate-pulse rounded-lg bg-surface-elevated" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-surface-elevated" />
        </div>
        <div className="h-28 w-28 animate-pulse rounded-full bg-surface-elevated" />
      </div>
    );
  }

  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-6xl font-bold tabular-nums tracking-tight text-foreground">
            {displayHour}:{minutes}
          </span>
          <span className="text-2xl font-medium text-muted-foreground">{ampm}</span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{dateStr}</p>
      </div>
      <ClockFace now={now} />
    </div>
  );
}
