"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

type WaitlistEntry = {
  id: string;
  status: string;
  notes: string | null;
  offeredStartsAt: string | null;
  offerExpiresAt: string | null;
  patient: { id: string; firstName: string; lastName: string; email: string | null };
  appointmentType: { id: string; name: string };
  practitioner: { displayName: string } | null;
};

type Catalog = {
  appointmentTypes: { id: string; name: string }[];
  practitioners: { id: string; displayName: string }[];
};

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

export default function WaitlistPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");

  const load = useCallback(() => {
    void Promise.all([
      api<{ entries: WaitlistEntry[] }>("/waitlist"),
      api<Catalog>("/clinic/catalog"),
      api<{ patients: Patient[] }>("/patients?take=200"),
    ])
      .then(([w, c, p]) => {
        setEntries(w.entries);
        setCatalog(c);
        setPatients(p.patients);
        if (!typeId && c.appointmentTypes[0]) setTypeId(c.appointmentTypes[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, [typeId]);

  useEffect(() => {
    if (authLoading) return;
    if (me?.role === "PRACTITIONER") {
      router.replace("/app");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [authLoading, me?.role, router]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId) ?? null,
    [patients, patientId],
  );

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients.slice(0, 12);
    return patients
      .filter((p) => {
        const hay = `${p.firstName} ${p.lastName} ${p.email ?? ""} ${p.phone ?? ""}`
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [patients, patientQuery]);

  function pickPatient(p: Patient) {
    setPatientId(p.id);
    setPatientQuery(`${p.firstName} ${p.lastName}`);
    setPatientMenuOpen(false);
  }

  async function addEntry() {
    setError(null);
    setMessage(null);
    if (!patientId) {
      setError("Choose a patient");
      return;
    }
    try {
      await api("/waitlist", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          appointmentTypeId: typeId,
          practitionerId: practitionerId || null,
        }),
      });
      setMessage("Added to waitlist.");
      setPatientId("");
      setPatientQuery("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add");
    }
  }

  function statusChipLabel(status: string) {
    switch (status.toUpperCase()) {
      case "WAITING":
        return "Waiting";
      case "OFFERED":
        return "Offered";
      case "BOOKED":
        return "Booked";
      case "DECLINED":
        return "Declined";
      case "CANCELLED":
        return "Cancelled";
      default:
        return status
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
    }
  }

  async function act(id: string, action: "accept" | "decline" | "cancel") {
    setError(null);
    setMessage(null);
    const entry = entries.find((e) => e.id === id);
    const patientName = entry
      ? `${entry.patient.firstName} ${entry.patient.lastName}`.trim()
      : "Patient";
    try {
      if (action === "cancel") {
        await api(`/waitlist/${id}`, { method: "DELETE" });
        setMessage(`Removed ${patientName} from waitlist.`);
      } else {
        const d = await api<{
          appointment?: { id: string; startsAt?: string };
        }>(`/waitlist/${id}`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        if (action === "accept") {
          const when = d.appointment?.startsAt
            ? format(new Date(d.appointment.startsAt), "EEE d MMM HH:mm")
            : entry?.offeredStartsAt
              ? format(new Date(entry.offeredStartsAt), "EEE d MMM HH:mm")
              : null;
          setMessage(
            when
              ? `Booked ${patientName} · ${when}`
              : `Booked ${patientName}`,
          );
        } else {
          setMessage(
            "Offer declined — next patient notified if available.",
          );
        }
      }
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  return (
    <AppShell
      title="Waitlist"
      subtitle="When a slot cancels, Treow offers it to the next matching patient."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Add patient</h2>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <label className="field">
            <span>Patient</span>
            <input
              className="search-input"
              type="search"
              autoComplete="off"
              placeholder="Type a name to find a patient"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setPatientMenuOpen(true);
                if (selectedPatient) {
                  const label = `${selectedPatient.firstName} ${selectedPatient.lastName}`;
                  if (e.target.value !== label) setPatientId("");
                }
              }}
              onFocus={() => setPatientMenuOpen(true)}
              onBlur={() => {
                // Allow click on suggestion before closing
                window.setTimeout(() => setPatientMenuOpen(false), 120);
              }}
            />
            {patientMenuOpen && !selectedPatient ? (
              <ul className="patient-lookup-results" role="listbox">
                {filteredPatients.length === 0 ? (
                  <li className="muted" style={{ padding: "0.65rem 0.75rem" }}>
                    No patients match that search.
                  </li>
                ) : (
                  filteredPatients.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="patient-lookup-option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickPatient(p)}
                      >
                        <span className="apt-name">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="muted">
                          {[p.email, p.phone].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
            {selectedPatient ? (
              <div className="patient-lookup-selected">
                <p className="apt-name">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setPatientId("");
                    setPatientQuery("");
                    setPatientMenuOpen(true);
                  }}
                >
                  Change patient
                </button>
              </div>
            ) : null}
          </label>
          <label className="field">
            <span>Service</span>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {(catalog?.appointmentTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Practitioner (optional)</span>
            <select
              value={practitionerId}
              onChange={(e) => setPractitionerId(e.target.value)}
            >
              <option value="">Any</option>
              {(catalog?.practitioners ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary" onClick={() => void addEntry()}>
            Add to waitlist
          </button>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Queue</h2>
            <span className="count">{entries.length}</span>
          </div>
          <ul className="apt-list">
            {entries.map((e) => (
              <li key={e.id} className="apt-row waitlist-row">
                <div className="apt-body">
                  <p className="apt-name waitlist-name">
                    {e.patient.firstName} {e.patient.lastName}
                  </p>
                  <p className="muted">
                    {e.appointmentType.name}
                    {e.practitioner ? ` · ${e.practitioner.displayName}` : " · any clinician"}
                  </p>
                  {e.offeredStartsAt ? (
                    <p className="alert-line">
                      Offered {format(new Date(e.offeredStartsAt), "EEE d MMM HH:mm")}
                      {e.offerExpiresAt
                        ? ` · expires ${format(new Date(e.offerExpiresAt), "HH:mm")}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="apt-actions">
                  <span className={`status status-${e.status.toLowerCase()}`}>
                    {statusChipLabel(e.status)}
                  </span>
                  {e.status === "OFFERED" ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => void act(e.id, "accept")}
                      >
                        Book
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => void act(e.id, "decline")}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => void act(e.id, "cancel")}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => void act(e.id, "cancel")}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {entries.length === 0 ? (
            <p className="muted">
              No one waiting. Cancel an appointment on{" "}
              <Link href="/app">Today</Link> to trigger an auto-offer when this
              queue has matches.
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
