"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

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
  const [selected, setSelected] = useState<Patient | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<{ patients: Patient[] }>(
        `/patients?q=${encodeURIComponent(q)}`,
      ).then((d) => setPatients(d.patients));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <AppShell title="Patients" subtitle="Search directory and open timelines.">
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
                onClick={() => setSelected(p)}
              >
                View
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="detail-box">
            <h3>
              {selected.firstName} {selected.lastName}
            </h3>
            <p className="muted">{selected.email}</p>
            <p className="muted">{selected.phone}</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
