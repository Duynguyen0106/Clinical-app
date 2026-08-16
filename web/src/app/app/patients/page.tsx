import { AppShell } from "@/components/AppShell";
import { DEMO_PATIENTS } from "@/modules/demo/data";
import Link from "next/link";

export default function PatientsPage() {
  return (
    <AppShell title="Patients" subtitle="Search, open timeline, capture consents.">
      <div className="panel">
        <div className="panel-head">
          <h2>Directory</h2>
          <button type="button" className="btn-secondary" disabled>
            Add patient
          </button>
        </div>
        <ul className="patient-list">
          {DEMO_PATIENTS.map((p) => (
            <li key={p.id} className="patient-row">
              <div>
                <p className="apt-name">
                  {p.firstName} {p.lastName}
                </p>
                <p className="muted">
                  {p.email} · {p.phone}
                </p>
                {p.alerts ? <p className="alert-line">{p.alerts}</p> : null}
              </div>
              <Link href="/app/visits/apt_1" className="btn-ghost">
                Open latest visit
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
