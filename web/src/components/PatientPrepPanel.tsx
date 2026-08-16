"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { api } from "@/lib/api";

export type PatientPrep = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  alerts: string | null;
  appointments: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    notes: string | null;
    serviceName: string;
    practitionerName: string;
    visitId: string | null;
  }>;
  notes: Array<{
    id: string;
    status: string;
    signedAt: string | null;
    createdAt: string;
    templateName: string | null;
    visitId: string | null;
    appointmentStartsAt: string | null;
    serviceName: string | null;
    practitionerName: string | null;
    summary: string;
    sections: { key: string; value: string }[];
  }>;
};

type Props = {
  patientId: string;
  /** Hide the appointment currently being viewed */
  excludeAppointmentId?: string;
  compact?: boolean;
  className?: string;
};

function titleCase(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function PatientPrepPanel({
  patientId,
  excludeAppointmentId,
  compact = false,
  className,
}: Props) {
  const [prep, setPrep] = useState<PatientPrep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void api<{ prep: PatientPrep }>(`/patients/${patientId}?prep=1`)
      .then((d) => {
        setPrep(d.prep);
        const firstSigned = d.prep.notes.find((n) => n.status === "SIGNED");
        setExpandedNoteId(firstSigned?.id ?? d.prep.notes[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className={`prep-panel ${className ?? ""}`}>
        <p className="muted">Loading patient history…</p>
      </div>
    );
  }

  if (error || !prep) {
    return (
      <div className={`prep-panel ${className ?? ""}`}>
        <p className="form-error">{error ?? "Could not load history"}</p>
      </div>
    );
  }

  const history = prep.appointments.filter(
    (a) => a.id !== excludeAppointmentId,
  );
  const past = history.filter(
    (a) =>
      new Date(a.startsAt).getTime() <= Date.now() ||
      ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status),
  );
  const upcoming = history.filter((a) => !past.includes(a));
  const signedNotes = prep.notes.filter((n) => n.status === "SIGNED");
  const otherNotes = prep.notes.filter((n) => n.status !== "SIGNED");

  return (
    <div className={`prep-panel ${compact ? "prep-compact" : ""} ${className ?? ""}`}>
      <div className="prep-head">
        <h3>Prepare for visit</h3>
        <p className="muted">
          Prior bookings and clinical notes for {prep.firstName} {prep.lastName}
        </p>
      </div>

      {(prep.alerts || prep.phone || prep.email) && (
        <div className="prep-meta">
          {prep.alerts ? <p className="alert-line">{prep.alerts}</p> : null}
          <p className="muted">
            {[prep.email, prep.phone].filter(Boolean).join(" · ") || "No contact on file"}
          </p>
        </div>
      )}

      <section className="prep-section">
        <h4>Booking history</h4>
        {history.length === 0 ? (
          <p className="muted">No other appointments on file.</p>
        ) : (
          <ul className="prep-list">
            {[...upcoming, ...past].slice(0, compact ? 5 : 10).map((a) => (
              <li key={a.id} className="prep-item">
                <div>
                  <strong>
                    {format(new Date(a.startsAt), "EEE d MMM yyyy · HH:mm")}
                  </strong>
                  <span className="muted">
                    {" "}
                    · {a.serviceName} · {a.practitionerName} · {a.status}
                  </span>
                  {a.notes ? <p className="prep-excerpt">{a.notes}</p> : null}
                </div>
                {a.visitId ? (
                  <Link href={`/app/visits/${a.visitId}`} className="btn-ghost btn-sm">
                    Visit
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="prep-section">
        <h4>Previous notes</h4>
        {signedNotes.length === 0 && otherNotes.length === 0 ? (
          <p className="muted">No clinical notes yet — first visit or notes unsigned.</p>
        ) : (
          <ul className="prep-list">
            {[...signedNotes, ...otherNotes].slice(0, compact ? 4 : 8).map((n) => {
              const open = expandedNoteId === n.id;
              const when = n.appointmentStartsAt ?? n.signedAt ?? n.createdAt;
              return (
                <li key={n.id} className="prep-item prep-note">
                  <button
                    type="button"
                    className="prep-note-toggle"
                    onClick={() => setExpandedNoteId(open ? null : n.id)}
                  >
                    <span>
                      <strong>
                        {format(new Date(when), "d MMM yyyy")}
                      </strong>
                      <span className="muted">
                        {" "}
                        · {n.serviceName ?? n.templateName ?? "Note"} · {n.status}
                      </span>
                      {!open && n.summary ? (
                        <p className="prep-excerpt">{n.summary}</p>
                      ) : null}
                    </span>
                    <span className="muted">{open ? "Hide" : "Read"}</span>
                  </button>
                  {open ? (
                    <div className="prep-note-body">
                      {n.sections.length === 0 ? (
                        <p className="muted">No readable sections in this note.</p>
                      ) : (
                        n.sections.map((s) => (
                          <div key={s.key} className="prep-section-block">
                            <strong>{titleCase(s.key)}</strong>
                            <p>{s.value}</p>
                          </div>
                        ))
                      )}
                      {n.visitId ? (
                        <Link
                          href={`/app/visits/${n.visitId}`}
                          className="btn-ghost btn-sm"
                        >
                          Open visit
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
