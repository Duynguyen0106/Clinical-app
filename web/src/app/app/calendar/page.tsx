"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, setHours, setMinutes } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  patient: { firstName: string; lastName: string };
  appointmentType: { name: string };
  visit: { id: string } | null;
};

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export default function CalendarPage() {
  const { me } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const dayLabel = format(new Date(), "EEEE d MMMM");

  useEffect(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    void api<{ appointments: Appointment[] }>(
      `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
    ).then((d) => setAppointments(d.appointments));
  }, []);

  return (
    <AppShell
      title="Calendar"
      subtitle="Day view — open a visit from any appointment."
    >
      <div className="panel calendar-panel">
        <div className="panel-head">
          <h2>{dayLabel}</h2>
          <Link
            href={`/book/${me?.clinic.slug ?? "northbank-manual"}`}
            className="btn-ghost"
          >
            Online booking link
          </Link>
        </div>
        <div className="cal-grid" role="grid" aria-label="Day calendar">
          {HOURS.map((hour) => {
            const slotStart = setMinutes(setHours(new Date(), hour), 0);
            const appts = appointments.filter(
              (a) => new Date(a.startsAt).getHours() === hour,
            );
            return (
              <div key={hour} className="cal-row">
                <div className="cal-hour">{format(slotStart, "HH:mm")}</div>
                <div className="cal-slot">
                  {appts.map((apt) => (
                    <button
                      key={apt.id}
                      type="button"
                      className="cal-event"
                      onClick={() => {
                        if (apt.visit) {
                          router.push(`/app/visits/${apt.visit.id}`);
                          return;
                        }
                        void api<{ visit: { id: string } }>("/visits", {
                          method: "POST",
                          body: JSON.stringify({ appointmentId: apt.id }),
                        }).then(({ visit }) => {
                          router.push(`/app/visits/${visit.id}`);
                        });
                      }}
                    >
                      <strong>
                        {apt.patient.firstName} {apt.patient.lastName}
                      </strong>
                      <span>{apt.appointmentType.name}</span>
                    </button>
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
