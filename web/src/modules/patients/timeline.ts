export type TimelineItem = {
  id: string;
  kind: "appointment" | "note" | "invoice";
  at: string;
  title: string;
  detail: string;
  status: string;
  href?: string | null;
};

/** Pure merge of patient chronology — safe for unit tests. */
export function buildPatientTimeline(args: {
  appointments: Array<{
    id: string;
    startsAt: Date;
    status: string;
    appointmentType: { name: string };
    practitioner: { displayName: string };
    visit: { id: string } | null;
  }>;
  notes: Array<{
    id: string;
    status: string;
    signedAt: Date | null;
    createdAt: Date;
    template: { name: string } | null;
    visitId: string | null;
  }>;
  invoices: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    issuedAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
  }>;
  includeNotes: boolean;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const a of args.appointments) {
    items.push({
      id: `apt-${a.id}`,
      kind: "appointment",
      at: a.startsAt.toISOString(),
      title: a.appointmentType.name,
      detail: a.practitioner.displayName,
      status: a.status,
      href: a.visit?.id ? `/app/visits/${a.visit.id}` : "/app/calendar",
    });
  }

  if (args.includeNotes) {
    for (const n of args.notes) {
      items.push({
        id: `note-${n.id}`,
        kind: "note",
        at: (n.signedAt ?? n.createdAt).toISOString(),
        title: n.template?.name ?? "Clinical note",
        detail: n.status === "SIGNED" ? "Signed" : n.status,
        status: n.status,
        href: n.visitId ? `/app/visits/${n.visitId}` : null,
      });
    }
  }

  for (const inv of args.invoices) {
    const pounds = (inv.amountCents / 100).toFixed(2);
    items.push({
      id: `inv-${inv.id}`,
      kind: "invoice",
      at: (inv.paidAt ?? inv.issuedAt ?? inv.createdAt).toISOString(),
      title: `£${pounds} ${inv.currency}`,
      detail: inv.status === "PAID" ? "Paid" : "Invoice",
      status: inv.status,
      href: "/app/money",
    });
  }

  return items.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
