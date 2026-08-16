"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type PatientSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth?: string | null;
  nhsNumber?: string | null;
  alerts?: string | null;
};

type Props = {
  value: string;
  onChange: (patientId: string, patient?: PatientSummary | null) => void;
  /** Prefill search when opening from a known patient */
  initialQuery?: string;
  allowCreate?: boolean;
};

export function PatientLookup({
  value,
  onChange,
  initialQuery = "",
  allowCreate = true,
}: Props) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [selected, setSelected] = useState<PatientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [nhsNumber, setNhsNumber] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      void api<{ patients: PatientSummary[] }>(
        `/patients?q=${encodeURIComponent(q)}&take=20`,
      )
        .then((d) => setResults(d.patients))
        .catch((e: Error) => setError(e.message));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const hit = results.find((p) => p.id === value);
    if (hit) setSelected(hit);
  }, [value, results]);

  function pick(p: PatientSummary) {
    setSelected(p);
    setCreating(false);
    setError(null);
    onChange(p.id, p);
  }

  async function createNew() {
    if (!firstName.trim() || !lastName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ patient: PatientSummary }>("/patients", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          dateOfBirth: dob ? `${dob}T00:00:00.000Z` : null,
          nhsNumber: nhsNumber.trim() || null,
        }),
      });
      setQ(`${d.patient.firstName} ${d.patient.lastName}`);
      setCreating(false);
      pick(d.patient);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create patient");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="patient-lookup">
      <label className="field">
        <span>Find patient</span>
        <input
          className="search-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (value) onChange("", null);
            setSelected(null);
          }}
          placeholder="Name, email, phone, or NHS number"
          autoComplete="off"
        />
      </label>

      {selected ? (
        <div className="patient-lookup-selected">
          <p className="apt-name">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="muted">
            {[selected.email, selected.phone, selected.nhsNumber]
              .filter(Boolean)
              .join(" · ") || "No contact details"}
          </p>
          {selected.alerts ? (
            <p className="alert-line">{selected.alerts}</p>
          ) : null}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              onChange("", null);
              setSelected(null);
            }}
          >
            Change patient
          </button>
        </div>
      ) : (
        <>
          <ul className="patient-lookup-results" role="listbox">
            {results.length === 0 ? (
              <li className="muted">
                {q.trim()
                  ? "No matches — create a new patient below."
                  : "Type to search the directory."}
              </li>
            ) : (
              results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="patient-lookup-option"
                    onClick={() => pick(p)}
                  >
                    <span className="apt-name">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="muted">
                      {[p.email, p.phone, p.nhsNumber]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {allowCreate ? (
            creating ? (
              <div className="patient-lookup-create">
                <p className="muted">New patient</p>
                <div className="team-reg-row">
                  <label className="field">
                    <span>First name</span>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <div className="team-reg-row">
                  <label className="field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>NHS number</span>
                    <input
                      value={nhsNumber}
                      onChange={(e) => setNhsNumber(e.target.value)}
                    />
                  </label>
                </div>
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busy || !firstName.trim() || !lastName.trim()}
                    onClick={() => void createNew()}
                  >
                    {busy ? "Saving…" : "Save & select"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  const parts = q.trim().split(/\s+/);
                  setFirstName(parts[0] ?? "");
                  setLastName(parts.slice(1).join(" "));
                  setCreating(true);
                }}
              >
                + New patient
              </button>
            )
          ) : null}
        </>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
