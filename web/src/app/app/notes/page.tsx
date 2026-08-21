"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

type Note = {
  id: string;
  status: string;
  updatedAt: string;
  parentNoteId?: string | null;
  patient: { firstName: string; lastName: string };
  template: { name: string } | null;
  visit: { id: string } | null;
};

type StatusFilter = "DRAFT" | "SIGNED" | "VOIDED";

function parseStatus(raw: string | null): StatusFilter {
  if (raw === "SIGNED" || raw === "VOIDED" || raw === "DRAFT") return raw;
  return "DRAFT";
}

function NotesPageInner() {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<StatusFilter>(() =>
    parseStatus(searchParams.get("status")),
  );
  const scoped = me?.role === "PRACTITIONER";

  useEffect(() => {
    setStatus(parseStatus(searchParams.get("status")));
  }, [searchParams]);

  useEffect(() => {
    if (!me) return;
    const qs = new URLSearchParams({ status });
    if (scoped && me.practitionerProfileId) {
      qs.set("practitionerId", me.practitionerProfileId);
    }
    void api<{ notes: Note[] }>(`/notes?${qs}`).then((d) => setNotes(d.notes));
  }, [me, scoped, status]);

  return (
    <AppShell
      title="Notes"
      subtitle={
        scoped
          ? "Your drafts, signed notes, and voided records."
          : "Clinic drafts, signed notes, and voided records."
      }
    >
      <div className="panel">
        <div className="panel-head">
          <h2>
            {status === "DRAFT"
              ? scoped
                ? "My unsigned drafts"
                : "Unsigned drafts"
              : status === "SIGNED"
                ? "Signed notes"
                : "Voided notes"}
          </h2>
          <div className="view-toggle" role="group">
            {(["DRAFT", "SIGNED", "VOIDED"] as const).map((s) => (
              <Link
                key={s}
                href={`/app/notes?status=${s}`}
                className={`btn-sm ${status === s ? "btn-secondary" : "btn-ghost"}`}
              >
                {s === "DRAFT" ? "Drafts" : s === "SIGNED" ? "Signed" : "Voided"}
              </Link>
            ))}
          </div>
          <span className="count">{notes.length}</span>
        </div>
        {notes.length === 0 ? (
          <p className="muted">
            {status === "DRAFT"
              ? "When you stop a recording, organised notes land here until you sign them."
              : status === "SIGNED"
                ? "No signed notes in this list yet."
                : "No voided notes."}
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
                    {n.template?.name ?? "Clinical note"}
                    {n.parentNoteId ? " · addendum" : ""} · {n.status}
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

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Notes" subtitle="Loading…">
          <p className="muted">Loading notes…</p>
        </AppShell>
      }
    >
      <NotesPageInner />
    </Suspense>
  );
}
