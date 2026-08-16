import { AppShell } from "@/components/AppShell";
import { DEMO_CLINIC } from "@/modules/config/brand";
import { DEMO_APPOINTMENTS } from "@/modules/demo/data";
import { format, setHours, setMinutes } from "date-fns";
import Link from "next/link";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export default function CalendarPage() {
  const dayLabel = format(new Date(), "EEEE d MMMM");

  return (
    <AppShell
      title="Calendar"
      subtitle="Day view — drag-and-drop and multi-practitioner lanes come next."
    >
      <div className="panel calendar-panel">
        <div className="panel-head">
          <h2>{dayLabel}</h2>
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Online booking link
          </Link>
        </div>
        <div className="cal-grid" role="grid" aria-label="Day calendar">
          {HOURS.map((hour) => {
            const slotStart = setMinutes(setHours(new Date(), hour), 0);
            const appts = DEMO_APPOINTMENTS.filter(
              (a) => new Date(a.startsAt).getHours() === hour,
            );
            return (
              <div key={hour} className="cal-row">
                <div className="cal-hour">{format(slotStart, "HH:mm")}</div>
                <div className="cal-slot">
                  {appts.map((apt) => (
                    <Link
                      key={apt.id}
                      href={`/app/visits/${apt.id}`}
                      className="cal-event"
                    >
                      <strong>{apt.patientName}</strong>
                      <span>{apt.type}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
