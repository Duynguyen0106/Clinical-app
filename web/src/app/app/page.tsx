"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";
import { pulseHrefForRole } from "@/modules/ops/pulse-links";

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
  links?: {
    utilisation?: string;
    rebook?: string;
    unsigned?: string;
    unpaid?: string;
    mix?: string;
  };
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
  /** One overflow menu open at a time on the day board */
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [pulseOpen, setPulseOpen] = useState(false);
  /** null = still reading storage; false = show first-run tips; true = dismissed */
  const [tipsHidden, setTipsHidden] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // First visit: key missing → show tips. After dismiss: "1" → hide.
      setTipsHidden(localStorage.getItem("treow.hideDeskTips") === "1");
    } catch {
      setTipsHidden(false);
    }
  }, []);

  const myPractitionerId = me?.practitionerProfileId ?? null;
  const isClinician =
    me?.role === "OWNER" || me?.role === "PRACTITIONER";
  const isPractitioner = me?.role === "PRACTITIONER";
  const isPractitionerHome = Boolean(myPractitionerId && isClinician);
  const canEditSchedule =
    me?.role === "OWNER" || me?.role === "RECEPTION";
  const showPracticePulse =
    me?.role === "OWNER" || me?.role === "RECEPTION";
  /** Practitioners stay on schedule + notes — no ops inbox */
  const showOpsInbox = !isPractitioner;

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
    ];

    if (showOpsInbox) {
      jobs.push(
        api<{ tasks: OpsTask[] }>("/ops/tasks").then((t) =>
          setTasks(t.tasks.slice(0, 5)),
        ),
      );
    } else {
      setTasks([]);
    }

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
  }, [
    me,
    isPractitionerHome,
    myPractitionerId,
    isClinician,
    showPracticePulse,
    showOpsInbox,
  ]);

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

  async function setAppointmentStatus(
    id: string,
    status: "CONFIRMED" | "CHECKED_IN" | "CANCELLED",
  ) {
    setError(null);
    setMessage(null);
    try {
      const d = await api<{
        appointment: {
          status: string;
          waitlistOffer?: {
            offered: boolean;
            entry: { patient: { firstName: string } } | null;
          };
        };
      }>(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (status === "CANCELLED") {
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
      } else if (status === "CHECKED_IN") {
        setMessage("Patient checked in.");
      } else {
        setMessage("Appointment confirmed.");
      }
      await loadDay();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  const title = isPractitioner ? "My day" : isPractitionerHome ? "My day" : "Today";
  const subtitle = isPractitioner
    ? "Your schedule and notes — open a visit to record and sign."
    : isPractitionerHome
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
                {(() => {
                  const awaiting =
                    nextUp.status === "BOOKED" ||
                    nextUp.status === "CONFIRMED";
                  const primaryIsCheckIn = canEditSchedule && awaiting;
                  const patientHref = `/app/patients?id=${encodeURIComponent(nextUp.patient.id)}`;
                  return (
                    <>
                      {primaryIsCheckIn ? (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() =>
                            void setAppointmentStatus(
                              nextUp.id,
                              "CHECKED_IN",
                            )
                          }
                        >
                          Check in
                        </button>
                      ) : isClinician ? (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() =>
                            void openVisit(
                              nextUp.id,
                              nextUp.visit?.id ?? undefined,
                            )
                          }
                        >
                          Open visit
                        </button>
                      ) : (
                        <Link href={patientHref} className="btn-primary btn-sm">
                          Patient
                        </Link>
                      )}
                      {primaryIsCheckIn && isClinician ? (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            void openVisit(
                              nextUp.id,
                              nextUp.visit?.id ?? undefined,
                            )
                          }
                        >
                          Open visit
                        </button>
                      ) : null}
                      {isClinician || primaryIsCheckIn ? (
                        <Link href={patientHref} className="btn-ghost btn-sm">
                          {isPractitioner ? "Prior notes" : "Patient"}
                        </Link>
                      ) : null}
                    </>
                  );
                })()}
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
                    {(() => {
                      const terminal = [
                        "CANCELLED",
                        "COMPLETED",
                        "NO_SHOW",
                      ].includes(apt.status);
                      const awaiting =
                        apt.status === "BOOKED" || apt.status === "CONFIRMED";
                      const canCancel = canEditSchedule && !terminal;
                      const primaryIsCheckIn = canEditSchedule && awaiting;
                      const primaryIsPatient =
                        canEditSchedule && !awaiting && !isClinician && !terminal;
                      const showOpenInOverflow =
                        isClinician && primaryIsCheckIn;
                      const showOverflow =
                        !terminal &&
                        (showOpenInOverflow || isClinician || canCancel);
                      const patientHref = `/app/patients?id=${encodeURIComponent(apt.patient.id)}`;

                      return (
                        <>
                          {primaryIsCheckIn ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() =>
                                void setAppointmentStatus(apt.id, "CHECKED_IN")
                              }
                            >
                              Check in
                            </button>
                          ) : isClinician && !terminal ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() =>
                                void openVisit(
                                  apt.id,
                                  apt.visit?.id ?? undefined,
                                )
                              }
                            >
                              Open visit
                            </button>
                          ) : primaryIsPatient ? (
                            <Link
                              href={patientHref}
                              className="btn-primary btn-sm"
                            >
                              Patient
                            </Link>
                          ) : null}

                          {showOverflow ? (
                            <>
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                aria-expanded={rowMenuId === apt.id}
                                onClick={() =>
                                  setRowMenuId((id) =>
                                    id === apt.id ? null : apt.id,
                                  )
                                }
                              >
                                {rowMenuId === apt.id ? "Less" : "More"}
                              </button>
                              {rowMenuId === apt.id ? (
                                <>
                                  {showOpenInOverflow ? (
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => {
                                        setRowMenuId(null);
                                        void openVisit(
                                          apt.id,
                                          apt.visit?.id ?? undefined,
                                        );
                                      }}
                                    >
                                      Open visit
                                    </button>
                                  ) : null}
                                  {isClinician ? (
                                    <Link
                                      href={patientHref}
                                      className="btn-ghost btn-sm"
                                      onClick={() => setRowMenuId(null)}
                                    >
                                      Prior notes
                                    </Link>
                                  ) : null}
                                  {canCancel ? (
                                    <button
                                      type="button"
                                      className="btn-ghost btn-sm apt-cancel-btn"
                                      onClick={() => {
                                        setRowMenuId(null);
                                        void setAppointmentStatus(
                                          apt.id,
                                          "CANCELLED",
                                        );
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      );
                    })()}
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
                        <Link
                          href={`/app/patients?id=${encodeURIComponent(n.patient.id)}`}
                        >
                          {n.patient.firstName} {n.patient.lastName} · prior
                          notes
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
                <h2>Needs attention</h2>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-expanded={pulseOpen}
                  onClick={() => setPulseOpen((o) => !o)}
                >
                  {pulseOpen ? "Hide pulse" : "Full pulse"}
                </button>
              </div>
              <div className="pulse-needs">
                <Link
                  href={pulseHrefForRole(
                    "unsigned",
                    me?.role,
                    pulse.links?.unsigned ?? "/app/notes?status=DRAFT",
                  )}
                >
                  {pulse.unsignedNotes} unsigned
                </Link>
                <span className="muted">·</span>
                <Link
                  href={pulseHrefForRole(
                    "unpaid",
                    me?.role,
                    pulse.links?.unpaid ?? "/app/money?status=unpaid",
                  )}
                >
                  {pulse.unpaidInvoices} unpaid (£
                  {(pulse.unpaidCents / 100).toFixed(0)})
                </Link>
              </div>
              {pulseOpen ? (
                <>
                  <div className="pulse-grid" style={{ marginTop: "0.75rem" }}>
                    <Link
                      href={pulseHrefForRole(
                        "utilisation",
                        me?.role,
                        pulse.links?.utilisation ?? "/app/calendar",
                      )}
                      className="pulse-metric"
                    >
                      <strong>{pulse.utilisationPct}%</strong>
                      <span>Utilisation</span>
                    </Link>
                    <Link
                      href={pulseHrefForRole(
                        "rebook",
                        me?.role,
                        pulse.links?.rebook ?? "/app/patients",
                      )}
                      className="pulse-metric"
                    >
                      <strong>{pulse.rebookRatePct}%</strong>
                      <span>Rebook</span>
                    </Link>
                    <Link
                      href={pulseHrefForRole(
                        "mix",
                        me?.role,
                        pulse.links?.mix ?? "/app/patients",
                      )}
                      className="pulse-metric"
                    >
                      <strong>
                        {pulse.newPatients}/{pulse.returningPatients}
                      </strong>
                      <span>New / return</span>
                    </Link>
                  </div>
                  <p className="muted pulse-meta">
                    {pulse.bookedMinutes}/{pulse.availableMinutes} min booked
                    this week
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          {showOpsInbox ? (
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
          ) : null}

          {tipsHidden === false && isClinician && !isPractitioner ? (
            <section className="panel tip-panel">
              <h2>Visit mode</h2>
              <p>
                Consent, record on this device, review the organised note, then
                sign. Read prior notes from patient prep before you start.
              </p>
              <Link href="/app/notes" className="btn-secondary">
                Unsigned drafts →
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  try {
                    localStorage.setItem("treow.hideDeskTips", "1");
                  } catch {
                    /* ignore */
                  }
                  setTipsHidden(true);
                }}
              >
                Got it — hide tips
              </button>
            </section>
          ) : null}

          {tipsHidden === false && !isClinician ? (
            <section className="panel tip-panel">
              <h2>Front desk</h2>
              <p>
                Check patients in on arrival, then book or cancel from the
                calendar. Clinical notes stay with practitioners.
              </p>
              <Link href="/app/calendar" className="btn-secondary">
                Calendar →
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  try {
                    localStorage.setItem("treow.hideDeskTips", "1");
                  } catch {
                    /* ignore */
                  }
                  setTipsHidden(true);
                }}
              >
                Got it — hide tips
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
