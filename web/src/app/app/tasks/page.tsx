"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type OpsTask = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
  priority: number;
};

const kindLabel: Record<string, string> = {
  UNSIGNED_NOTE: "Sign",
  UNPAID_INVOICE: "Pay",
  MISSING_INTAKE: "Intake",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ tasks: OpsTask[] }>("/ops/tasks")
      .then((d) => setTasks(d.tasks))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      title="Tasks"
      subtitle="Unsigned notes, unpaid invoices, and missing intake — one inbox."
    >
      <section className="panel">
        <div className="panel-head">
          <h2>Open</h2>
          <span className="count">{tasks.length}</span>
        </div>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="apt-list">
          {tasks.map((t) => (
            <li key={t.id} className="apt-row">
              <div className="apt-time">
                <span className={`status status-${t.kind.toLowerCase()}`}>
                  {kindLabel[t.kind] ?? t.kind}
                </span>
              </div>
              <div className="apt-body">
                <p className="apt-name">{t.title}</p>
                <p className="muted">{t.detail}</p>
              </div>
              <div className="apt-actions">
                <Link href={t.href} className="btn-secondary btn-sm">
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {!loading && tasks.length === 0 ? (
          <p className="muted">All clear — no open ops tasks.</p>
        ) : null}
      </section>
    </AppShell>
  );
}
