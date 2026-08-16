"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Note = {
  id: string;
  status: string;
  updatedAt: string;
  patient: { firstName: string; lastName: string };
  template: { name: string } | null;
  visit: { id: string } | null;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    void api<{ notes: Note[] }>("/notes?status=DRAFT").then((d) =>
      setNotes(d.notes),
    );
  }, []);

  return (
    <AppShell
      title="Notes"
      subtitle="Drafts waiting for signature appear here."
    >
      <div className="panel">
        <div className="panel-head">
          <h2>Unsigned drafts</h2>
          <span className="count">{notes.length}</span>
        </div>
        {notes.length === 0 ? (
          <p className="muted">
            When you stop a recording, organised notes land here until you sign
            them.
          </p>
        ) : (
          <ul className="apt-list">
            {notes.map((n) => (
              <li key={n.id} className="patient-row">
                <div>
                  <p className="apt-name">
                    {n.patient.firstName} {n.patient.lastName}
                  </p>
                  <p className="muted">
                    {n.template?.name ?? "Clinical note"} · {n.status}
                  </p>
                </div>
                {n.visit ? (
                  <Link href={`/app/visits/${n.visit.id}`} className="btn-primary btn-sm">
                    Open visit
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
