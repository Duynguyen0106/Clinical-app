"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Calendar, FileText, Banknote } from "lucide-react";

export type TimelineItem = {
  id: string;
  kind: "appointment" | "note" | "invoice";
  at: string;
  title: string;
  detail: string;
  status: string;
  href?: string | null;
};

type Props = {
  items: TimelineItem[];
  compact?: boolean;
  canViewNotes?: boolean;
};

function KindIcon({ kind }: { kind: TimelineItem["kind"] }) {
  if (kind === "note") return <FileText size={14} aria-hidden />;
  if (kind === "invoice") return <Banknote size={14} aria-hidden />;
  return <Calendar size={14} aria-hidden />;
}

export function PatientTimeline({
  items,
  compact = false,
  canViewNotes = true,
}: Props) {
  const shown = items.slice(0, compact ? 8 : 24);

  return (
    <section className="prep-section">
      <h4>Patient timeline</h4>
      {!canViewNotes ? (
        <p className="muted">
          Bookings and invoices — clinical notes are clinician-only.
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className="muted">No appointments, notes, or invoices yet.</p>
      ) : (
        <ul className="prep-list timeline-list">
          {shown.map((item) => {
            const body = (
              <>
                <span className="timeline-kind" data-kind={item.kind}>
                  <KindIcon kind={item.kind} />
                </span>
                <div className="timeline-body">
                  <p className="apt-name">
                    {format(new Date(item.at), "d MMM yyyy · HH:mm")}
                  </p>
                  <p className="muted">
                    {item.title}
                    {item.detail ? ` · ${item.detail}` : ""} ·{" "}
                    {item.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
              </>
            );
            return (
              <li key={item.id} className="prep-item timeline-item">
                {item.href ? (
                  <Link href={item.href} className="timeline-link">
                    {body}
                  </Link>
                ) : (
                  <div className="timeline-link">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
