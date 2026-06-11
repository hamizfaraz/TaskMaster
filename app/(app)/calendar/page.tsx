import { requireServerSession } from "@/lib/auth-session";
import { listUserClassEvents } from "@/lib/classes/queries";
import { CalendarClient, type CalendarEvent } from "./calendar-client";

export default async function CalendarPage() {
  const session = await requireServerSession("/calendar");
  const events = await listUserClassEvents(session.user.id);
  const initialDate = new Date().toISOString();
  const calendarEvents: CalendarEvent[] = events.map((event) => ({
    ...event,
    dueAt: event.dueAt ? event.dueAt.toISOString() : null,
  }));

  return (
    <div className="h-full overflow-hidden">
      <CalendarClient events={calendarEvents} initialDate={initialDate} />
    </div>
  );
}
