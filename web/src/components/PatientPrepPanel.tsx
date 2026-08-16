"use client";

import { useEffect, useRef, useState } from "react";
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
  canViewClinicalNotes?: boolean;
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

type NoteBody = {
  summary: string;
  sections: { key: string; value: string }[];
};

type Props = {
  patientId: string;
  /** Hide the appointment currently being viewed */
  excludeAppointmentId?: string;
  compact?: boolean;
  className?: string;
  /** Audit source label: calendar | visit | patients */
  source?: string;
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
  source = "unknown",
}: Props) {
  const [prep, setPrep] = useState<PatientPrep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [noteBodies, setNoteBodies] = useState<Record<string, NoteBody>>({});
  const [loadingBodyId, setLoadingBodyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedBodies = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedNoteId(null);
    setNoteBodies({});
    loadedBodies.current = new Set();
    void api<{ prep: PatientPrep }>(
      `/patients/${patientId}?prep=1&source=${encodeURIComponent(source)}`,
    )
      .then((d) => {
        setPrep(d.prep);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [patientId, source]);

  async function loadNoteBody(noteId: string) {
    if (loadedBodies.current.has(noteId)) return;
    loadedBodies.current.add(noteId);
    setLoadingBodyId(noteId);
    try {
      const result = await api<{
        ok: boolean;
        summary: string;
        sections: { key: string; value: string }[];
      }>(`/patients/${patientId}`, {
        method: "POST",
        body: JSON.stringify({
          action: "note_expanded",
          noteId,
          source: `${source}_expand`,
        }),
      });
      setNoteBodies((prev) => ({
        ...prev,
        [noteId]: {
          summary: result.summary ?? "",
          sections: result.sections ?? [],
        },
      }));
    } catch (e) {
      loadedBodies.current.delete(noteId);
      setError(e instanceof Error ? e.message : "Could not open note");
    } finally {
      setLoadingBodyId(null);
    }
  }

  function toggleNote(noteId: string) {
    const open = expandedNoteId === noteId;
    if (open) {
      setExpandedNoteId(null);
      return;
    }
    setExpandedNoteId(noteId);
    void loadNoteBody(noteId);
  }

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
  const canViewNotes = prep.canViewClinicalNotes !== false;
  const signedNotes = prep.notes.filter((n) => n.status === "SIGNED");
  const otherNotes = prep.notes.filter((n) => n.status !== "SIGNED");

  return (
    <div className={`prep-panel ${compact ? "prep-compact" : ""} ${className ?? ""}`}>
      <div className="prep-head">
        <h3>Prepare for visit</h3>
        <p className="muted">
          {canViewNotes
            ? `Prior bookings and clinical notes for ${prep.firstName} ${prep.lastName}`
            : `Booking history for ${prep.firstName} ${prep.lastName} (clinical notes are clinician-only)`}
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
                {a.visitId && canViewNotes ? (
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
        {!canViewNotes ? (
          <p className="muted">
            Clinical note history is restricted to practitioners and owners.
          </p>
        ) : signedNotes.length === 0 && otherNotes.length === 0 ? (
          <p className="muted">No clinical notes yet — first visit or notes unsigned.</p>
        ) : (
          <ul className="prep-list">
            {[...signedNotes, ...otherNotes].slice(0, compact ? 4 : 8).map((n) => {
              const open = expandedNoteId === n.id;
              const body = noteBodies[n.id];
              const when = n.appointmentStartsAt ?? n.signedAt ?? n.createdAt;
              return (
                <li key={n.id} className="prep-item prep-note">
                  <button
                    type="button"
                    className="prep-note-toggle"
                    onClick={() => toggleNote(n.id)}
                  >
                    <span>
                      <strong>
                        {format(new Date(when), "d MMM yyyy")}
                      </strong>
                      <span className="muted">
                        {" "}
                        · {n.serviceName ?? n.templateName ?? "Note"} · {n.status}
                        {n.practitionerName ? ` · ${n.practitionerName}` : ""}
                      </span>
                    </span>
                    <span className="muted">
                      {loadingBodyId === n.id
                        ? "Loading…"
                        : open
                          ? "Hide"
                          : "Read"}
                    </span>
                  </button>
                  {open ? (
                    <div className="prep-note-body">
                      {!body ? (
                        <p className="muted">Loading note…</p>
                      ) : body.sections.length === 0 ? (
                        <p className="muted">No readable sections in this note.</p>
                      ) : (
                        body.sections.map((s) => (
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
