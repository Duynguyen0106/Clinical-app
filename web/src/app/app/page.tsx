"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { firstName: string; lastName: string };
  appointmentType: { name: string };
  visit: { id: string } | null;
};

export default function TodayPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    void api<{ appointments: Appointment[] }>(
      `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
    )
      .then((d) => setAppointments(d.appointments))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openVisit(appointmentId: string, existingVisitId?: string) {
    if (existingVisitId) {
      router.push(`/app/visits/${existingVisitId}`);
      return;
    }
    const { visit } = await api<{ visit: { id: string } }>("/visits", {
      method: "POST",
      body: JSON.stringify({ appointmentId }),
    });
    router.push(`/app/visits/${visit.id}`);
  }

  return (
    <AppShell
      title="Today"
      subtitle="Open a visit to record — Treow organises the note for you to sign."
    >
      <div className="today-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Appointments</h2>
            <span className="count">{appointments.length}</span>
          </div>
          {loading ? <p className="muted">Loading…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <ul className="apt-list">
            {appointments.map((apt) => (
              <li key={apt.id} className="apt-row">
                <div className="apt-time">
                  <strong>{format(new Date(apt.startsAt), "HH:mm")}</strong>
                  <span>{format(new Date(apt.endsAt), "HH:mm")}</span>
                </div>
                <div className="apt-body">
                  <p className="apt-name">
                    {apt.patient.firstName} {apt.patient.lastName}
                  </p>
                  <p className="muted">{apt.appointmentType.name}</p>
                </div>
                <div className="apt-actions">
                  <span className={`status status-${apt.status.toLowerCase()}`}>
                    {apt.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      void openVisit(apt.id, apt.visit?.id ?? undefined)
                    }
                  >
                    Open visit
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!loading && appointments.length === 0 ? (
            <p className="muted">No appointments today.</p>
          ) : null}
        </section>
        <aside className="side-stack">
          <section className="panel tip-panel">
            <h2>AI scribe</h2>
            <p>
              Consent, record on this device, review the organised note, then
              sign. Nothing enters the record without you.
            </p>
            <Link href="/app/notes" className="btn-secondary">
              Unsigned drafts →
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
