import {
  AppointmentStatus,
  InvoiceStatus,
  NoteStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { pulseLinksPayload } from "@/modules/ops/pulse-links";

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(weekStart: Date) {
  const x = new Date(weekStart);
  x.setDate(x.getDate() + 7);
  return x;
}

/**
 * Five practice pulse metrics for the current clinic week (Mon–Sun).
 */
export async function getPracticePulse(ctx: AuthContext) {
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeek(weekStart);

  const [
    appointments,
    availabilityRules,
    unsignedNotes,
    unpaidInvoices,
    completedThisWeek,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        startsAt: { gte: weekStart, lt: weekEnd },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
      select: {
        id: true,
        patientId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        practitionerId: true,
      },
    }),
    prisma.availabilityRule.findMany({
      where: { practitioner: { membership: { clinicId: ctx.clinicId } } },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    ctx.role === "RECEPTION"
      ? Promise.resolve(0)
      : prisma.clinicalNote.count({
          where: {
            status: NoteStatus.DRAFT,
            patient: { clinicId: ctx.clinicId },
            ...(ctx.role === "PRACTITIONER" && ctx.practitionerProfileId
              ? {
                  visit: {
                    appointment: {
                      practitionerId: ctx.practitionerProfileId,
                    },
                  },
                }
              : {}),
          },
        }),
    prisma.invoice.findMany({
      where: {
        clinicId: ctx.clinicId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.DRAFT] },
      },
      select: { amountCents: true },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        status: AppointmentStatus.COMPLETED,
        endsAt: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true, patientId: true, endsAt: true },
    }),
  ]);

  let bookedMinutes = 0;
  for (const a of appointments) {
    bookedMinutes += Math.max(
      0,
      (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000,
    );
  }

  let availableMinutes = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const dow = day.getDay();
    for (const rule of availabilityRules) {
      if (rule.dayOfWeek === dow) {
        availableMinutes += Math.max(0, rule.endMinute - rule.startMinute);
      }
    }
  }
  const utilisationPct =
    availableMinutes > 0
      ? Math.round((bookedMinutes / availableMinutes) * 1000) / 10
      : 0;

  // Rebook: one query for later bookings (no per-visit N+1).
  const completedPatientIds = [
    ...new Set(completedThisWeek.map((c) => c.patientId)),
  ];
  let rebooked = 0;
  if (completedPatientIds.length > 0) {
    const followUps = await prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        patientId: { in: completedPatientIds },
        startsAt: { gt: weekStart },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
      select: { patientId: true, startsAt: true },
    });
    for (const done of completedThisWeek) {
      if (
        followUps.some(
          (f) => f.patientId === done.patientId && f.startsAt > done.endsAt,
        )
      ) {
        rebooked += 1;
      }
    }
  }

  const rebookRatePct =
    completedThisWeek.length > 0
      ? Math.round((rebooked / completedThisWeek.length) * 1000) / 10
      : 0;

  // New vs returning: first-ever appointment per patient in one query.
  const patientIds = [...new Set(appointments.map((a) => a.patientId))];
  let newPatients = 0;
  let returningPatients = 0;
  if (patientIds.length > 0) {
    const firsts = await prisma.appointment.groupBy({
      by: ["patientId"],
      where: {
        clinicId: ctx.clinicId,
        patientId: { in: patientIds },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
      _min: { startsAt: true },
    });
    const firstByPatient = new Map(
      firsts.map((f) => [f.patientId, f._min.startsAt] as const),
    );
    for (const patientId of patientIds) {
      const first = firstByPatient.get(patientId);
      if (first && first >= weekStart && first < weekEnd) newPatients += 1;
      else returningPatients += 1;
    }
  }

  const unpaidCount = unpaidInvoices.length;
  const unpaidCents = unpaidInvoices.reduce((s, i) => s + i.amountCents, 0);

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    utilisationPct,
    bookedMinutes: Math.round(bookedMinutes),
    availableMinutes,
    rebookRatePct,
    completedVisits: completedThisWeek.length,
    rebookedFollowUps: rebooked,
    unsignedNotes,
    unpaidInvoices: unpaidCount,
    unpaidCents,
    newPatients,
    returningPatients,
    links: pulseLinksPayload(),
  };
}
