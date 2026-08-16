"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDays,
  format,
  setHours,
  setMinutes,
  startOfWeek,
} from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  patient: { firstName: string; lastName: string };
  appointmentType: { name: string };
  room: { name: string } | null;
  visit: { id: string } | null;
};

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export default function CalendarPage() {
  const { me } = useAuth();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(() => {
    const from = weekStart;
    const to = addDays(weekStart, 7);
    void api<{ appointments: Appointment[] }>(
      `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
    )
      .then((d) => setAppointments(d.appointments))
      .catch((e: Error) => setError(e.message));
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  async function reschedule(id: string, day: Date, hour: number) {
    const startsAt = setMinutes(setHours(day, hour), 0);
    try {
      await api(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startsAt: startsAt.toISOString() }),
      });
      setError(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reschedule");
    }
  }

  return (
    <AppShell
      title="Calendar"
      subtitle="Week view — drag an appointment onto a new day and hour to reschedule."
    >
      <div className="panel calendar-panel">
        <div className="panel-head week-toolbar">
          <div className="week-nav">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              ← Prev
            </button>
            <h2>
              {format(weekStart, "d MMM")} –{" "}
              {format(addDays(weekStart, 6), "d MMM yyyy")}
            </h2>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            >
              Next →
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
            >
              This week
            </button>
          </div>
          <Link
            href={`/book/${me?.clinic.slug ?? "northbank-manual"}`}
            className="btn-ghost"
          >
            Online booking
          </Link>
        </div>
        {error ? <p className="form-error">{error}</p> : null}

        <div className="week-grid" role="grid" aria-label="Week calendar">
          <div className="week-corner" />
          {days.map((day) => (
            <div key={day.toISOString()} className="week-day-head">
              <strong>{format(day, "EEE")}</strong>
              <span>{format(day, "d MMM")}</span>
            </div>
          ))}

          {HOURS.map((hour) => (
            <div key={hour} className="week-hour-row">
              <div className="week-hour">{`${String(hour).padStart(2, "0")}:00`}</div>
              {days.map((day) => {
                const cellAppts = appointments.filter((a) => {
                  const s = new Date(a.startsAt);
                  return (
                    s.getFullYear() === day.getFullYear() &&
                    s.getMonth() === day.getMonth() &&
                    s.getDate() === day.getDate() &&
                    s.getHours() === hour
                  );
                });
                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`week-cell ${draggingId ? "droppable" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id =
                        e.dataTransfer.getData("text/appointment-id") ||
                        draggingId;
                      if (id) void reschedule(id, day, hour);
                      setDraggingId(null);
                    }}
                  >
                    {cellAppts.map((apt) => (
                      <button
                        key={apt.id}
                        type="button"
                        className="cal-event week-event"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "text/appointment-id",
                            apt.id,
                          );
                          setDraggingId(apt.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => {
                          if (apt.visit) {
                            router.push(`/app/visits/${apt.visit.id}`);
                            return;
                          }
                          void api<{ visit: { id: string } }>("/visits", {
                            method: "POST",
                            body: JSON.stringify({ appointmentId: apt.id }),
                          }).then(({ visit }) =>
                            router.push(`/app/visits/${visit.id}`),
                          );
                        }}
                        title="Drag to reschedule, click to open visit"
                      >
                        <strong>
                          {apt.patient.firstName} {apt.patient.lastName}
                        </strong>
                        <span>{apt.appointmentType.name}</span>
                        {apt.room ? (
                          <span className="cal-room">{apt.room.name}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
