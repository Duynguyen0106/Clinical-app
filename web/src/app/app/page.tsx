"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string };
  appointmentType: { name: string };
  practitioner?: { id: string; displayName: string };
  visit: { id: string } | null;
};

type DraftNote = {
  id: string;
  updatedAt: string;
  patient: { id: string; firstName: string; lastName: string };
  template: { name: string } | null;
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
  const { me, loading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [drafts, setDrafts] = useState<DraftNote[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const myPractitionerId = me?.practitionerProfileId ?? null;
  const isClinician =
    me?.role === "OWNER" || me?.role === "PRACTITIONER";
  const isPractitionerHome = Boolean(myPractitionerId && isClinician);
  const canEditSchedule =
    me?.role === "OWNER" || me?.role === "RECEPTION";
  const showPracticePulse =
    me?.role === "OWNER" || me?.role === "RECEPTION";

  const loadDay = useCallback(() => {
    if (!me) return Promise.resolve();
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);

    const aptQs = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    // Practitioners (and owners with a diary) land on their own list
    if (isPractitionerHome && myPractitionerId) {
      aptQs.set("practitionerId", myPractitionerId);
    }

    const notesQs = new URLSearchParams({ status: "DRAFT" });
    if (me.role === "PRACTITIONER" && myPractitionerId) {
      notesQs.set("practitionerId", myPractitionerId);
    }

    const jobs: Promise<unknown>[] = [
      api<{ appointments: Appointment[] }>(`/appointments?${aptQs}`).then(
        (a) => setAppointments(a.appointments),
      ),
      api<{ tasks: OpsTask[] }>("/ops/tasks").then((t) =>
        setTasks(t.tasks.slice(0, 5)),
      ),
    ];

    if (isClinician) {
      jobs.push(
        api<{ notes: DraftNote[] }>(`/notes?${notesQs}`).then((n) =>
          setDrafts(n.notes.slice(0, 6)),
        ),
      );
    }

    if (showPracticePulse) {
      jobs.push(
        api<{ pulse: Pulse }>("/ops/pulse").then((p) => setPulse(p.pulse)),
      );
    } else {
      setPulse(null);
    }

    return Promise.all(jobs);
  }, [me, isPractitionerHome, myPractitionerId, isClinician, showPracticePulse]);

  useEffect(() => {
    if (authLoading || !me) return;
    setLoading(true);
    void loadDay()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, me, loadDay]);

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
      if (
        d.appointment.waitlistOffer?.offered &&
        d.appointment.waitlistOffer.entry
      ) {
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

  const title = isPractitionerHome ? "My day" : "Today";
  const subtitle = isPractitionerHome
    ? "Your diary, unsigned notes, and patient prep — open a visit to record and sign."
    : "Clinic day board — open a visit to record and sign.";

  const nextUp = appointments.find(
    (a) =>
      !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(a.status) &&
      new Date(a.endsAt).getTime() >= Date.now(),
  );

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="today-grid">
        <div className="side-stack">
          {isPractitionerHome && nextUp ? (
            <section className="panel tip-panel next-up-panel">
              <div className="panel-head">
                <h2>Up next</h2>
                <Link href="/app/calendar" className="btn-ghost btn-sm">
                  Full calendar →
                </Link>
              </div>
              <p className="apt-name">
                {format(new Date(nextUp.startsAt), "HH:mm")} ·{" "}
                {nextUp.patient.firstName} {nextUp.patient.lastName}
              </p>
              <p className="muted">{nextUp.appointmentType.name}</p>
              <div className="apt-actions next-up-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() =>
                    void openVisit(nextUp.id, nextUp.visit?.id ?? undefined)
                  }
                >
                  Open visit
                </button>
                <Link
                  href={`/app/patients`}
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    /* patients page lets them pick prep */
                  }}
                >
                  Patient directory
                </Link>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2>{isPractitionerHome ? "My appointments" : "Appointments"}</h2>
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
                    <p className="muted">
                      {apt.appointmentType.name}
                      {!isPractitionerHome && apt.practitioner
                        ? ` · ${apt.practitioner.displayName}`
                        : ""}
                    </p>
                  </div>
                  <div className="apt-actions">
                    <span
                      className={`status status-${apt.status.toLowerCase()}`}
                    >
                      {apt.status.replaceAll("_", " ").toLowerCase()}
                    </span>
                    {isClinician ? (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() =>
                          void openVisit(apt.id, apt.visit?.id ?? undefined)
                        }
                      >
                        Open visit
                      </button>
                    ) : null}
                    {canEditSchedule ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => void cancelAppointment(apt.id)}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {!loading && appointments.length === 0 ? (
              <p className="muted">
                {isPractitionerHome
                  ? "Nothing on your diary today."
                  : "No appointments today."}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="side-stack">
          {isClinician ? (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  {me?.role === "PRACTITIONER"
                    ? "My unsigned notes"
                    : "Unsigned notes"}
                </h2>
                <Link href="/app/notes" className="btn-ghost btn-sm">
                  All →
                </Link>
              </div>
              {drafts.length === 0 && !loading ? (
                <p className="muted">No drafts waiting for signature.</p>
              ) : (
                <ul className="task-snip">
                  {drafts.map((n) => (
                    <li key={n.id}>
                      {n.visit ? (
                        <Link href={`/app/visits/${n.visit.id}`}>
                          {n.patient.firstName} {n.patient.lastName}
                          {n.template?.name ? ` · ${n.template.name}` : ""}
                        </Link>
                      ) : (
                        <Link href={`/app/patients`}>
                          {n.patient.firstName} {n.patient.lastName} · open
                          prep
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

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
                {pulse.bookedMinutes}/{pulse.availableMinutes} min booked this
                week
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

          {isClinician ? (
            <section className="panel tip-panel">
              <h2>Visit mode</h2>
              <p>
                Consent, record on this device, review the organised note, then
                sign. Read prior notes from patient prep before you start.
              </p>
              <Link href="/app/notes" className="btn-secondary">
                Unsigned drafts →
              </Link>
              <Link href="/app/patients" className="btn-ghost">
                Patient prep →
              </Link>
            </section>
          ) : (
            <section className="panel tip-panel">
              <h2>Front desk</h2>
              <p>
                Book and cancel from the calendar. Clinical notes stay with
                practitioners.
              </p>
              <Link href="/app/calendar" className="btn-secondary">
                Calendar →
              </Link>
              <Link href="/app/waitlist" className="btn-ghost">
                Waitlist →
              </Link>
            </section>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
