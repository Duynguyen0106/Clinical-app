"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  alerts: string | null;
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<{ patients: Patient[] }>(
        `/patients?q=${encodeURIComponent(q)}`,
      ).then((d) => setPatients(d.patients));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const selected = patients.find((p) => p.id === selectedId) ?? null;

  return (
    <AppShell
      title="Patients"
      subtitle="Search the directory and review booking history plus prior notes before a visit."
    >
      <div className="patients-layout">
        <div className="panel">
          <div className="panel-head">
            <h2>Directory</h2>
            <input
              className="search-input"
              placeholder="Search name, email, phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="patient-list">
            {patients.map((p) => (
              <li key={p.id} className="patient-row">
                <div>
                  <p className="apt-name">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="muted">
                    {[p.email, p.phone].filter(Boolean).join(" · ")}
                  </p>
                  {p.alerts ? <p className="alert-line">{p.alerts}</p> : null}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setSelectedId(p.id)}
                >
                  Prep
                </button>
              </li>
            ))}
          </ul>
        </div>
        {selected ? (
          <div className="panel">
            <PatientPrepPanel patientId={selected.id} source="patients" />
          </div>
        ) : (
          <div className="panel empty-panel">
            <p className="muted">
              Select a patient to see their booking history and previous clinical
              notes.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
