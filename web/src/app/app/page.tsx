import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DEMO_APPOINTMENTS } from "@/modules/demo/data";
import { format } from "date-fns";

export default function TodayPage() {
  return (
    <AppShell
      title="Today"
      subtitle="Your day at a glance — open a visit to record and let AI draft the note."
    >
      <div className="today-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Appointments</h2>
            <span className="count">{DEMO_APPOINTMENTS.length}</span>
          </div>
          <ul className="apt-list">
            {DEMO_APPOINTMENTS.map((apt) => (
              <li key={apt.id} className="apt-row">
                <div className="apt-time">
                  <strong>{format(new Date(apt.startsAt), "HH:mm")}</strong>
                  <span>{format(new Date(apt.endsAt), "HH:mm")}</span>
                </div>
                <div className="apt-body">
                  <p className="apt-name">{apt.patientName}</p>
                  <p className="muted">{apt.type}</p>
                </div>
                <div className="apt-actions">
                  <span className={`status status-${apt.status}`}>
                    {apt.status.replace("_", " ")}
                  </span>
                  <Link
                    href={`/app/visits/${apt.id}`}
                    className="btn-primary btn-sm"
                  >
                    Open visit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="side-stack">
          <section className="panel tip-panel">
            <h2>AI scribe</h2>
            <p>
              Record the consultation. Treow organises a structured note. You
              review and sign — nothing enters the record without you.
            </p>
            <Link href="/app/visits/apt_1" className="btn-secondary">
              Try with Sarah Chen →
            </Link>
          </section>
          <section className="panel">
            <h2>Waitlist</h2>
            <p className="muted">1 patient flexible this afternoon</p>
            <p className="waitlist-name">Mina Patel · Manual therapy</p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
