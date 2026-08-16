"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";

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
};

function dobInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
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
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api<{ patients: Patient[] }>(
      `/patients?q=${encodeURIComponent(q)}`,
    )
      .then((d) => setPatients(d.patients))
      .catch((e: Error) => setError(e.message));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

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

  const showForm = creating || editing;

  return (
    <AppShell
      title="Patients"
      subtitle="Directory, contact details, NHS/GP fields — search then book from Calendar."
    >
      <div className="patients-layout">
        <div className="panel">
          <div className="panel-head">
            <h2>Directory</h2>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={startCreate}
            >
              + New
            </button>
          </div>
          <input
            className="search-input"
            placeholder="Search name, email, phone, NHS number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <ul className="patient-list">
            {patients.map((p) => (
              <li key={p.id} className="patient-row">
                <div>
                  <p className="apt-name">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="muted">
                    {[p.email, p.phone, p.nhsNumber]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.alerts ? <p className="alert-line">{p.alerts}</p> : null}
                </div>
                <div className="patient-row-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setCreating(false);
                      setEditing(false);
                      setSelectedId(p.id);
                    }}
                  >
                    Prep
                  </button>
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
                </div>
              </li>
            ))}
          </ul>
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
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => startEdit(selected)}
              >
                Edit details
              </button>
            </div>
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
            <PatientPrepPanel patientId={selected.id} source="patients" />
          </div>
        ) : (
          <div className="panel empty-panel">
            <p className="muted">
              Search or create a patient. On Calendar, click an empty time slot
              and look them up to book.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
