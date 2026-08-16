import { z } from "zod";
import {
  AppointmentStatus,
  WaitlistStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, notFound } from "@/server/errors";
import { requirePatient } from "@/modules/patients/service";
import { sendWaitlistOfferEmail } from "@/modules/notifications/appointments";

const waitlistInclude = {
  patient: true,
  practitioner: true,
  appointmentType: true,
} as const;

export const createWaitlistSchema = z.object({
  patientId: z.string().min(1),
  appointmentTypeId: z.string().min(1),
  practitionerId: z.string().optional().nullable(),
  preferredFrom: z.string().datetime().optional().nullable(),
  preferredTo: z.string().datetime().optional().nullable(),
  autoNotify: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function listWaitlist(
  ctx: AuthContext,
  opts: { status?: WaitlistStatus } = {},
) {
  return prisma.waitlistEntry.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(opts.status
        ? { status: opts.status }
        : { status: { not: WaitlistStatus.CANCELLED } }),
    },
    include: waitlistInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function createWaitlistEntry(
  ctx: AuthContext,
  input: z.infer<typeof createWaitlistSchema>,
) {
  await requirePatient(ctx.clinicId, input.patientId);

  const type = await prisma.appointmentType.findFirst({
    where: { id: input.appointmentTypeId, clinicId: ctx.clinicId, active: true },
  });
  if (!type) throw notFound("Appointment type not found");

  if (input.practitionerId) {
    const practitioner = await prisma.practitionerProfile.findFirst({
      where: {
        id: input.practitionerId,
        active: true,
        membership: { clinicId: ctx.clinicId },
      },
    });
    if (!practitioner) throw notFound("Practitioner not found");
  }

  return prisma.waitlistEntry.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      appointmentTypeId: input.appointmentTypeId,
      practitionerId: input.practitionerId ?? null,
      preferredFrom: input.preferredFrom
        ? new Date(input.preferredFrom)
        : null,
      preferredTo: input.preferredTo ? new Date(input.preferredTo) : null,
      autoNotify: input.autoNotify ?? true,
      notes: input.notes ?? null,
      status: WaitlistStatus.WAITING,
    },
    include: waitlistInclude,
  });
}

export async function cancelWaitlistEntry(ctx: AuthContext, id: string) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!entry) throw notFound("Waitlist entry not found");
  return prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: WaitlistStatus.CANCELLED },
    include: waitlistInclude,
  });
}

/**
 * After a cancellation frees a slot, offer it to the best matching waitlist patient.
 */
export async function offerSlotToWaitlist(opts: {
  clinicId: string;
  appointmentTypeId: string;
  practitionerId: string;
  startsAt: Date;
  endsAt: Date;
  sourceAppointmentId: string;
}) {
  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      clinicId: opts.clinicId,
      status: WaitlistStatus.WAITING,
      autoNotify: true,
      appointmentTypeId: opts.appointmentTypeId,
      OR: [
        { practitionerId: null },
        { practitionerId: opts.practitionerId },
      ],
    },
    include: {
      patient: true,
      appointmentType: true,
      clinic: true,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const match = candidates.find((entry) => {
    if (entry.preferredFrom && opts.startsAt < entry.preferredFrom) return false;
    if (entry.preferredTo && opts.startsAt > entry.preferredTo) return false;
    return true;
  });

  if (!match) {
    return { offered: false as const, entry: null };
  }

  const offerExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const updated = await prisma.waitlistEntry.update({
    where: { id: match.id },
    data: {
      status: WaitlistStatus.OFFERED,
      offeredStartsAt: opts.startsAt,
      offeredEndsAt: opts.endsAt,
      offeredAt: new Date(),
      offerExpiresAt,
      practitionerId: match.practitionerId ?? opts.practitionerId,
    },
    include: waitlistInclude,
  });

  await sendWaitlistOfferEmail({
    entryId: updated.id,
    clinicName: match.clinic.name,
    timezone: match.clinic.timezone,
    patientEmail: match.patient.email,
    patientPhone: match.patient.phone,
    patientFirstName: match.patient.firstName,
    serviceName: match.appointmentType.name,
    startsAt: opts.startsAt,
    expiresAt: offerExpiresAt,
  });

  return { offered: true as const, entry: updated };
}

export async function acceptWaitlistOffer(ctx: AuthContext, id: string) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: { appointmentType: true },
  });
  if (!entry) throw notFound("Waitlist entry not found");
  if (entry.status !== WaitlistStatus.OFFERED) {
    throw badRequest("Entry is not in OFFERED status");
  }
  if (!entry.offeredStartsAt || !entry.offeredEndsAt) {
    throw badRequest("Offer has no slot times");
  }
  if (entry.offerExpiresAt && entry.offerExpiresAt < new Date()) {
    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: WaitlistStatus.WAITING,
        offeredStartsAt: null,
        offeredEndsAt: null,
        offeredAt: null,
        offerExpiresAt: null,
      },
    });
    throw badRequest("Offer expired — patient returned to waitlist");
  }

  const practitionerId = entry.practitionerId;
  if (!practitionerId) throw badRequest("Offer missing practitioner");

  const conflictApt = await prisma.appointment.findFirst({
    where: {
      clinicId: ctx.clinicId,
      practitionerId,
      status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
      startsAt: { lt: entry.offeredEndsAt },
      endsAt: { gt: entry.offeredStartsAt },
    },
  });
  if (conflictApt) {
    throw conflict("Slot is no longer free");
  }

  const { findAvailableRoom } = await import("./rooms");
  const freeRoom = await findAvailableRoom({
    clinicId: ctx.clinicId,
    startsAt: entry.offeredStartsAt,
    endsAt: entry.offeredEndsAt,
  });

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: entry.patientId,
      practitionerId,
      appointmentTypeId: entry.appointmentTypeId,
      roomId: freeRoom?.id ?? null,
      startsAt: entry.offeredStartsAt,
      endsAt: entry.offeredEndsAt,
      status: AppointmentStatus.BOOKED,
      notes: "Booked from waitlist offer",
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      room: true,
    },
  });

  const updated = await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: WaitlistStatus.BOOKED,
      bookedAppointmentId: appointment.id,
    },
    include: waitlistInclude,
  });

  return { entry: updated, appointment };
}

export async function declineWaitlistOffer(ctx: AuthContext, id: string) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!entry) throw notFound("Waitlist entry not found");
  if (entry.status !== WaitlistStatus.OFFERED) {
    throw badRequest("Entry is not in OFFERED status");
  }

  // Mark declined, then try next waiting patient for the same slot
  const declined = await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: WaitlistStatus.DECLINED,
      offeredStartsAt: null,
      offeredEndsAt: null,
      offeredAt: null,
      offerExpiresAt: null,
    },
    include: waitlistInclude,
  });

  let nextOffer = null;
  if (entry.offeredStartsAt && entry.offeredEndsAt && entry.practitionerId) {
    nextOffer = await offerSlotToWaitlist({
      clinicId: ctx.clinicId,
      appointmentTypeId: entry.appointmentTypeId,
      practitionerId: entry.practitionerId,
      startsAt: entry.offeredStartsAt,
      endsAt: entry.offeredEndsAt,
      sourceAppointmentId: entry.bookedAppointmentId ?? entry.id,
    });
  }

  return { entry: declined, nextOffer };
}
