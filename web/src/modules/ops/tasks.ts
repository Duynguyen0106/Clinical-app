import {
  AppointmentStatus,
  DepositStatus,
  InvoiceStatus,
  NoteStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";

export type OpsTask = {
  id: string;
  kind:
    | "UNSIGNED_NOTE"
    | "UNPAID_INVOICE"
    | "MISSING_INTAKE"
    | "DEPOSIT_DUE";
  title: string;
  detail: string;
  href: string;
  priority: number;
  createdAt: string;
};

const TERMINAL_APPOINTMENT: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

export async function listOpsTasks(ctx: AuthContext): Promise<OpsTask[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const ownDiaryId =
    ctx.role === "PRACTITIONER" ? (ctx.practitionerProfileId ?? "__none__") : null;
  // Practitioners: own-diary drafts/intake only; hide clinic-wide money tasks
  const includeMoneyTasks = ctx.role !== "PRACTITIONER";

  const draftDiaryFilter = ownDiaryId
    ? {
        OR: [
          {
            visit: {
              appointment: { practitionerId: ownDiaryId },
            },
          },
          { signedById: ctx.userId },
        ],
      }
    : {};

  const [draftNotes, unpaidInvoices, upcoming, depositsDue] = await Promise.all([
    prisma.clinicalNote.findMany({
      where: {
        status: NoteStatus.DRAFT,
        patient: { clinicId: ctx.clinicId },
        ...draftDiaryFilter,
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    includeMoneyTasks
      ? prisma.invoice.findMany({
          where: {
            clinicId: ctx.clinicId,
            status: { in: [InvoiceStatus.SENT, InvoiceStatus.DRAFT] },
          },
          include: {
            patient: { select: { firstName: true, lastName: true } },
          },
          orderBy: { issuedAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        startsAt: { gte: now, lte: horizon },
        ...(ownDiaryId ? { practitionerId: ownDiaryId } : {}),
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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            intakeSubmissions: {
              where: {
                status: "COMPLETED",
                formKey: "osteo_consent_v1",
              },
              take: 1,
              select: { id: true },
            },
          },
        },
        appointmentType: true,
      },
      orderBy: { startsAt: "asc" },
      take: 80,
    }),
    includeMoneyTasks
      ? prisma.appointment.findMany({
          where: {
            clinicId: ctx.clinicId,
            depositStatus: DepositStatus.REQUIRED,
            depositCents: { gt: 0 },
            status: { notIn: TERMINAL_APPOINTMENT },
            startsAt: { gte: now, lte: horizon },
          },
          include: {
            patient: { select: { firstName: true, lastName: true } },
            appointmentType: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  const tasks: OpsTask[] = [];

  for (const note of draftNotes) {
    // Reception cannot open clinical notes — only surface sign-off tasks to clinicians
    if (ctx.role === "RECEPTION") continue;
    const visitHref = note.visitId
      ? `/app/visits/${note.visitId}`
      : `/app/notes?status=DRAFT`;
    tasks.push({
      id: `note-${note.id}`,
      kind: "UNSIGNED_NOTE",
      title: `Sign draft — ${note.patient.firstName} ${note.patient.lastName}`,
      detail: "AI/clinical draft waiting for practitioner sign-off",
      href: visitHref,
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
    const hasSignedConsent = apt.patient.intakeSubmissions.length > 0;
    if (hasSignedConsent) continue;

    tasks.push({
      id: `intake-${apt.id}`,
      kind: "MISSING_INTAKE",
      title: `Chase consent forms — ${apt.patient.firstName} ${apt.patient.lastName}`,
      detail: `${apt.appointmentType.name} · osteopathic consent pack outstanding`,
      href: `/app/patients?id=${encodeURIComponent(apt.patient.id)}`,
      priority: 3,
      createdAt: apt.createdAt.toISOString(),
    });
  }

  for (const apt of depositsDue) {
    const pounds = (apt.depositCents / 100).toFixed(2);
    const when = apt.startsAt.toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    tasks.push({
      id: `deposit-${apt.id}`,
      kind: "DEPOSIT_DUE",
      title: `Deposit due £${pounds} — ${apt.patient.firstName} ${apt.patient.lastName}`,
      detail: `${apt.appointmentType.name} · ${when}`,
      href: `/app/calendar`,
      priority: 2,
      createdAt: apt.createdAt.toISOString(),
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
}
