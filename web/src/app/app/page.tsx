"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { firstName: string; lastName: string };
  appointmentType: { name: string };
  visit: { id: string } | null;
};

type Pulse = {
  utilisationPct: number;
  rebookRatePct: number;
  unsignedNotes: number;
  unpaidInvoices: number;
  unpaidCents: number;
  newPatients: number;
  returningPatients: number;
  bookedMinutes: number;
  availableMinutes: number;
};

type OpsTask = {
  id: string;
  kind: string;
  title: string;
  href: string;
};

export default function TodayPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function loadDay() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    return Promise.all([
      api<{ appointments: Appointment[] }>(
        `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
      api<{ pulse: Pulse }>("/ops/pulse"),
      api<{ tasks: OpsTask[] }>("/ops/tasks"),
    ]).then(([a, p, t]) => {
      setAppointments(a.appointments);
      setPulse(p.pulse);
      setTasks(t.tasks.slice(0, 5));
    });
  }

  useEffect(() => {
    void loadDay()
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

  async function cancelAppointment(id: string) {
    setError(null);
    setMessage(null);
    try {
      const d = await api<{
        appointment: {
          waitlistOffer?: {
            offered: boolean;
            entry: { patient: { firstName: string } } | null;
          };
        };
      }>(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (d.appointment.waitlistOffer?.offered && d.appointment.waitlistOffer.entry) {
        setMessage(
          `Cancelled — offered slot to ${d.appointment.waitlistOffer.entry.patient.firstName} on the waitlist.`,
        );
      } else {
        setMessage("Appointment cancelled.");
      }
      await loadDay();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cancel failed");
    }
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
          {message ? <p className="alert-line">{message}</p> : null}
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
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => void cancelAppointment(apt.id)}
                  >
                    Cancel
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
          {pulse ? (
            <section className="panel pulse-panel">
              <div className="panel-head">
                <h2>Practice pulse</h2>
                <Link href="/app/tasks" className="btn-ghost btn-sm">
                  Tasks
                </Link>
              </div>
              <div className="pulse-grid">
                <div>
                  <strong>{pulse.utilisationPct}%</strong>
                  <span>Utilisation</span>
                </div>
                <div>
                  <strong>{pulse.rebookRatePct}%</strong>
                  <span>Rebook</span>
                </div>
                <div>
                  <strong>{pulse.unsignedNotes}</strong>
                  <span>Unsigned</span>
                </div>
                <div>
                  <strong>{pulse.unpaidInvoices}</strong>
                  <span>Unpaid</span>
                </div>
                <div>
                  <strong>
                    {pulse.newPatients}/{pulse.returningPatients}
                  </strong>
                  <span>New / return</span>
                </div>
              </div>
              <p className="muted pulse-meta">
                £{(pulse.unpaidCents / 100).toFixed(0)} outstanding ·{" "}
                {pulse.bookedMinutes}/{pulse.availableMinutes} min booked this week
              </p>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2>Open tasks</h2>
              <Link href="/app/tasks" className="btn-ghost btn-sm">
                All →
              </Link>
            </div>
            <ul className="task-snip">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={t.href}>{t.title}</Link>
                </li>
              ))}
            </ul>
            {tasks.length === 0 && !loading ? (
              <p className="muted">Inbox clear.</p>
            ) : null}
          </section>

          <section className="panel tip-panel">
            <h2>AI scribe</h2>
            <p>
              Consent, record on this device, review the organised note, then
              sign. Nothing enters the record without you.
            </p>
            <Link href="/app/notes" className="btn-secondary">
              Unsigned drafts →
            </Link>
            <Link href="/app/waitlist" className="btn-ghost">
              Waitlist →
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
