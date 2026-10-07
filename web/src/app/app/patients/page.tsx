"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";

type TodayAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  appointmentType: { id: string; name: string; durationMinutes: number };
  visit: { id: string } | null;
};

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  alerts: string | null;
  gpName: string | null;
  gpPractice: string | null;
  gpEmail: string | null;
  nhsNumber: string | null;
  todayAppointments?: TodayAppointment[];
};

function dobInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function todayYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  nhsNumber: "",
  alerts: "",
  gpName: "",
  gpPractice: "",
  gpEmail: "",
};

export default function PatientsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Patients" subtitle="Loading…">
          <p className="muted">Loading patients…</p>
        </AppShell>
      }
    >
      <PatientsPageInner />
    </Suspense>
  );
}

function PatientsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me, loading: authLoading } = useAuth();
  const isPractitioner = me?.role === "PRACTITIONER";
  const myPractitionerId = me?.practitionerProfileId ?? null;
  const deepLinkId =
    searchParams.get("id") ?? searchParams.get("patientId") ?? null;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const dayLabel = useMemo(() => format(new Date(), "EEEE d MMMM"), []);

  const load = useCallback(() => {
    if (authLoading || !me) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (isPractitioner) {
      qs.set("appointmentOn", todayYmd());
      if (myPractitionerId) qs.set("practitionerId", myPractitionerId);
    }
    void api<{ patients: Patient[] }>(`/patients?${qs}`)
      .then((d) => {
        setPatients(d.patients);
        setSelectedId((prev) => {
          const preferred = deepLinkId ?? prev;
          if (preferred && d.patients.some((p) => p.id === preferred)) {
            return preferred;
          }
          if (isPractitioner) return null;
          return preferred;
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [
    q,
    isPractitioner,
    myPractitionerId,
    me,
    authLoading,
    deepLinkId,
  ]);

  useEffect(() => {
    if (authLoading || !me) return;
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
  }, [load, authLoading, me]);

  useEffect(() => {
    if (deepLinkId) setSelectedId(deepLinkId);
  }, [deepLinkId]);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

  function selectPatient(id: string) {
    setCreating(false);
    setEditing(false);
    setSelectedId(id);
    setError(null);
    setMessage(null);
    if (isPractitioner) {
      router.replace(`/app/patients?id=${encodeURIComponent(id)}`, {
        scroll: false,
      });
    }
  }

  function startCreate() {
    setCreating(true);
    setEditing(false);
    setSelectedId(null);
    setForm(emptyForm);
    setError(null);
    setMessage(null);
  }

  function startEdit(p: Patient) {
    setCreating(false);
    setEditing(true);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? "",
      phone: p.phone ?? "",
      dateOfBirth: dobInput(p.dateOfBirth),
      nhsNumber: p.nhsNumber ?? "",
      alerts: p.alerts ?? "",
      gpName: p.gpName ?? "",
      gpPractice: p.gpPractice ?? "",
      gpEmail: p.gpEmail ?? "",
    });
    setError(null);
    setMessage(null);
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const body = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      dateOfBirth: form.dateOfBirth || null,
      nhsNumber: form.nhsNumber.trim() || null,
      alerts: form.alerts.trim() || null,
      gpName: form.gpName.trim() || null,
      gpPractice: form.gpPractice.trim() || null,
      gpEmail: form.gpEmail.trim() || null,
    };
    try {
      if (creating) {
        const d = await api<{ patient: Patient }>("/patients", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Patient created.");
        setCreating(false);
        setSelectedId(d.patient.id);
        setQ(`${d.patient.firstName} ${d.patient.lastName}`);
      } else if (selectedId) {
        await api(`/patients/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage("Patient details saved.");
        setEditing(false);
        load();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const showForm = !isPractitioner && (creating || editing);
  const nextApt = selected?.todayAppointments?.[0] ?? null;

  return (
    <AppShell
      title="Patients"
      subtitle={
        isPractitioner
          ? `Today’s diary · ${dayLabel} — open a patient to read prior notes before the visit.`
          : "Directory, contact details, NHS/GP fields — search then book from Calendar."
      }
    >
      <div className="patients-layout">
        <div className="panel">
          <div className="panel-head">
            <h2>{isPractitioner ? "Today’s patients" : "Directory"}</h2>
            {!isPractitioner ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={startCreate}
              >
                + New
              </button>
            ) : (
              <Link href="/app" className="btn-ghost btn-sm">
                My day →
              </Link>
            )}
          </div>
          <input
            className="search-input"
            placeholder={
              isPractitioner
                ? "Filter today’s list by name"
                : "Search name, email, phone, NHS number"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          {loading ? <p className="muted">Loading…</p> : null}
          <ul className="patient-list">
            {patients.map((p) => {
              const apt = p.todayAppointments?.[0];
              const active = p.id === selectedId;
              return (
                <li
                  key={p.id}
                  className={`patient-row${active ? " patient-row-active" : ""}`}
                >
                  <button
                    type="button"
                    className="patient-row-main"
                    onClick={() => selectPatient(p.id)}
                  >
                    {apt ? (
                      <span className="patient-day-time">
                        {format(new Date(apt.startsAt), "HH:mm")}
                      </span>
                    ) : null}
                    <span className="patient-row-copy">
                      <span className="apt-name">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="muted">
                        {apt
                          ? `${apt.appointmentType.name} · ${apt.status
                              .replaceAll("_", " ")
                              .toLowerCase()}`
                          : [p.email, p.phone, p.nhsNumber]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                      {p.alerts ? (
                        <span className="alert-line">{p.alerts}</span>
                      ) : null}
                    </span>
                  </button>
                  <div className="patient-row-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => selectPatient(p.id)}
                    >
                      {isPractitioner ? "Prior notes" : "Prep"}
                    </button>
                    {!isPractitioner ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setSelectedId(p.id);
                          startEdit(p);
                        }}
                      >
                        Edit
                      </button>
                    ) : apt?.visit ? (
                      <Link
                        href={`/app/visits/${apt.visit.id}`}
                        className="btn-primary btn-sm"
                      >
                        Visit
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {!loading && patients.length === 0 ? (
            <p className="muted">
              {isPractitioner
                ? "No patients on your diary today."
                : "No patients match that search."}
            </p>
          ) : null}
        </div>

        {showForm ? (
          <div className="panel">
            <div className="panel-head">
              <h2>{creating ? "New patient" : "Edit patient"}</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setCreating(false);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
            <div className="team-reg-row">
              <label className="field">
                <span>First name</span>
                <input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Last name</span>
                <input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </label>
            <div className="team-reg-row">
              <label className="field">
                <span>Date of birth</span>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>NHS number</span>
                <input
                  value={form.nhsNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nhsNumber: e.target.value }))
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Alerts (reception / clinical)</span>
              <input
                value={form.alerts}
                onChange={(e) =>
                  setForm((f) => ({ ...f, alerts: e.target.value }))
                }
                placeholder="e.g. Interpreter needed"
              />
            </label>
            <label className="field">
              <span>GP name</span>
              <input
                value={form.gpName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gpName: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>GP practice</span>
              <input
                value={form.gpPractice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gpPractice: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>GP email</span>
              <input
                type="email"
                value={form.gpEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gpEmail: e.target.value }))
                }
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : creating ? "Create patient" : "Save details"}
            </button>
          </div>
        ) : selected ? (
          <div className="panel">
            <div className="panel-head">
              <h2>
                {selected.firstName} {selected.lastName}
              </h2>
              {!isPractitioner ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => startEdit(selected)}
                >
                  Edit details
                </button>
              ) : nextApt?.visit ? (
                <Link
                  href={`/app/visits/${nextApt.visit.id}`}
                  className="btn-primary btn-sm"
                >
                  Open visit
                </Link>
              ) : null}
            </div>
            {nextApt ? (
              <p className="patient-day-slot">
                <strong>{format(new Date(nextApt.startsAt), "HH:mm")}</strong>
                <span className="muted">
                  {" "}
                  · {nextApt.appointmentType.name} ·{" "}
                  {nextApt.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </p>
            ) : null}
            <p className="muted">
              {[
                selected.email,
                selected.phone,
                selected.nhsNumber ? `NHS ${selected.nhsNumber}` : null,
                selected.dateOfBirth
                  ? `DOB ${dobInput(selected.dateOfBirth)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {selected.gpName || selected.gpPractice ? (
              <p className="muted">
                GP: {[selected.gpName, selected.gpPractice]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <PatientPrepPanel
              patientId={selected.id}
              source="patients"
              autoExpandLatest
              excludeAppointmentId={nextApt?.id}
            />
          </div>
        ) : (
          <div className="panel empty-panel">
            <p className="muted">
              {isPractitioner
                ? "Select a patient from today’s list to read prior clinical notes."
                : "Search or create a patient. On Calendar, click an empty time slot and look them up to book."}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
