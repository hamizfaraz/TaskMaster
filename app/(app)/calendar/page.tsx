import { requireServerSession } from "@/lib/auth-session";
import { listUserClassEvents } from "@/lib/classes/queries";
import { listUserReviewEvents } from "@/lib/spaced-repetition/queries";
import { CalendarClient, type CalendarEvent } from "./calendar-client";

export default async function CalendarPage() {
  const session = await requireServerSession("/calendar");
  const [events, reviewEvents] = await Promise.all([
    listUserClassEvents(session.user.id),
    listUserReviewEvents(session.user.id),
  ]);
  const initialDate = new Date().toISOString();
  const calendarEvents: CalendarEvent[] = [
    ...events.map((event) => ({
      ...event,
      dueAt: event.dueAt ? event.dueAt.toISOString() : null,
    })),
    // Spaced-repetition review dates (already in CalendarEvent shape).
    ...reviewEvents,
  ];

  return (
    <div className="h-full overflow-hidden">
      <CalendarClient events={calendarEvents} initialDate={initialDate} />
    </div>
  );
}
