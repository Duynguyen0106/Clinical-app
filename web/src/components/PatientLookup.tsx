"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export type PatientLookupDetail = {
  patient?: PatientSummary | null;
  /** Reason for visit captured on new-patient intake */
  intakeNote?: string | null;
};

type Props = {
  value: string;
  onChange: (patientId: string, detail?: PatientLookupDetail | null) => void;
  initialQuery?: string;
  allowCreate?: boolean;
};

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || parts[0] || "",
  };
}

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

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [recordingPref, setRecordingPref] = useState(false);
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

  function pick(p: PatientSummary, intakeNote?: string | null) {
    setSelected(p);
    setCreating(false);
    setError(null);
    onChange(p.id, { patient: p, intakeNote: intakeNote ?? null });
  }

  function startCreate() {
    const fromSearch = q.trim();
    setFullName(fromSearch);
    setEmail("");
    setPhone("");
    setReason("");
    setPrivacy(false);
    setRecordingPref(false);
    setDob("");
    setNhsNumber("");
    setCreating(true);
    setError(null);
  }

  async function createNew() {
    const { firstName, lastName } = splitName(fullName);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter the patient’s full name");
      return;
    }
    if (!email.trim()) {
      setError("Email is required for a new patient (same as online booking)");
      return;
    }
    if (!privacy) {
      setError("Privacy notice consent is required");
      return;
    }

    setBusy(true);
    setError(null);
    const intakeNote = reason.trim() || null;
    const alerts = [
      intakeNote ? `Intake: ${intakeNote}` : null,
      recordingPref
        ? "Prefers recording for clinical notes (confirm at visit)"
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    try {
      const d = await api<{ patient: PatientSummary }>("/patients", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          dateOfBirth: dob || null,
          nhsNumber: nhsNumber.trim() || null,
          alerts: alerts || null,
        }),
      });

      await api(`/patients/${d.patient.id}/consents`, {
        method: "POST",
        body: JSON.stringify({
          type: "PRIVACY_POLICY",
          granted: true,
          method: "in_person",
        }),
      });

      if (recordingPref) {
        await api(`/patients/${d.patient.id}/consents`, {
          method: "POST",
          body: JSON.stringify({
            type: "RECORDING",
            granted: true,
            method: "in_person",
            meta: { preferred: true, confirmAtVisit: true },
          }),
        });
      }

      setQ(`${d.patient.firstName} ${d.patient.lastName}`);
      setCreating(false);
      pick(d.patient, intakeNote);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create patient");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="patient-lookup">
      {!creating ? (
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
      ) : null}

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
      ) : creating ? (
        <div className="patient-lookup-create">
          <h3 className="patient-intake-title">New patient intake</h3>
          <p className="muted">
            Same details as when a patient books online for the first time.
          </p>
          <label className="field">
            <span>Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </label>
          <label className="field">
            <span>Reason for visit (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Right shoulder pain for 3 weeks"
            />
          </label>
          <label className="consent-label">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
            />
            <span>
              Patient agrees to the{" "}
              <Link href="/privacy" target="_blank" rel="noreferrer">
                clinic privacy notice
              </Link>{" "}
              and processing of health information for this appointment (UK
              GDPR).
            </span>
          </label>
          <label className="consent-label">
            <input
              type="checkbox"
              checked={recordingPref}
              onChange={(e) => setRecordingPref(e.target.checked)}
            />
            <span>
              Happy for the clinician to record the consultation to help write
              clinical notes (confirmed again at the visit).
            </span>
          </label>
          <div className="team-reg-row">
            <label className="field">
              <span>Date of birth (optional)</span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </label>
            <label className="field">
              <span>NHS number (optional)</span>
              <input
                value={nhsNumber}
                onChange={(e) => setNhsNumber(e.target.value)}
              />
            </label>
          </div>
          <div className="home-cta">
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy || !fullName.trim() || !email.trim() || !privacy
              }
              onClick={() => void createNew()}
            >
              {busy ? "Saving…" : "Save patient & continue"}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setCreating(false)}
            >
              Back to search
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="patient-lookup-results" role="listbox">
            {results.length === 0 ? (
              <li className="muted">
                {q.trim()
                  ? "No matches — register them as a new patient."
                  : "Type to search, or register a new patient."}
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
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={startCreate}
            >
              + New patient (first-time intake)
            </button>
          ) : null}
        </>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
