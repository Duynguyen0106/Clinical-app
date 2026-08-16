import {
  AppointmentStatus,
  InvoiceStatus,
  NoteStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";

export type OpsTask = {
  id: string;
  kind: "UNSIGNED_NOTE" | "UNPAID_INVOICE" | "MISSING_INTAKE";
  title: string;
  detail: string;
  href: string;
  priority: number;
  createdAt: string;
};

export async function listOpsTasks(ctx: AuthContext): Promise<OpsTask[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [draftNotes, unpaidInvoices, upcoming] = await Promise.all([
    prisma.clinicalNote.findMany({
      where: {
        status: NoteStatus.DRAFT,
        patient: { clinicId: ctx.clinicId },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: {
        clinicId: ctx.clinicId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.DRAFT] },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        startsAt: { gte: now, lte: horizon },
        status: {
          in: [
            AppointmentStatus.BOOKED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
          ],
        },
      },
      include: {
        patient: {
          include: {
            consents: {
              where: { type: "PRIVACY_POLICY", granted: true },
              take: 1,
            },
          },
        },
        appointmentType: true,
      },
      orderBy: { startsAt: "asc" },
      take: 80,
    }),
  ]);

  const tasks: OpsTask[] = [];

  for (const note of draftNotes) {
    tasks.push({
      id: `note-${note.id}`,
      kind: "UNSIGNED_NOTE",
      title: `Sign draft — ${note.patient.firstName} ${note.patient.lastName}`,
      detail: "AI/clinical draft waiting for practitioner sign-off",
      href: `/app/notes`,
      priority: 1,
      createdAt: note.updatedAt.toISOString(),
    });
  }

  for (const inv of unpaidInvoices) {
    const pounds = (inv.amountCents / 100).toFixed(2);
    tasks.push({
      id: `inv-${inv.id}`,
      kind: "UNPAID_INVOICE",
      title: `Unpaid £${pounds} — ${inv.patient.firstName} ${inv.patient.lastName}`,
      detail: `Invoice ${inv.status.toLowerCase()}`,
      href: `/app/money`,
      priority: 2,
      createdAt: (inv.issuedAt ?? inv.createdAt).toISOString(),
    });
  }

  for (const apt of upcoming) {
    const hasPrivacy = apt.patient.consents.length > 0;
    const hasIntakeNote =
      Boolean(apt.notes?.toLowerCase().includes("intake")) ||
      Boolean(apt.patient.alerts?.toLowerCase().includes("intake"));
    if (hasPrivacy && hasIntakeNote) continue;
    if (hasPrivacy) continue; // privacy is the hard gate for "missing intake"

    tasks.push({
      id: `intake-${apt.id}`,
      kind: "MISSING_INTAKE",
      title: `Chase intake — ${apt.patient.firstName} ${apt.patient.lastName}`,
      detail: `${apt.appointmentType.name} · no privacy consent on file`,
      href: `/app/patients`,
      priority: 3,
      createdAt: apt.createdAt.toISOString(),
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
}
