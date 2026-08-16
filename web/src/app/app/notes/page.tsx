"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
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
  const { me } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const scoped = me?.role === "PRACTITIONER";

  useEffect(() => {
    if (!me) return;
    const qs = new URLSearchParams({ status: "DRAFT" });
    if (scoped && me.practitionerProfileId) {
      qs.set("practitionerId", me.practitionerProfileId);
    }
    void api<{ notes: Note[] }>(`/notes?${qs}`).then((d) => setNotes(d.notes));
  }, [me, scoped]);

  return (
    <AppShell
      title="Notes"
      subtitle={
        scoped
          ? "Your drafts waiting for signature."
          : "Drafts waiting for signature appear here."
      }
    >
      <div className="panel">
        <div className="panel-head">
          <h2>{scoped ? "My unsigned drafts" : "Unsigned drafts"}</h2>
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
                  <Link
                    href={`/app/visits/${n.visit.id}`}
                    className="btn-primary btn-sm"
                  >
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
