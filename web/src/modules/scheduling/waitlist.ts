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
import { waitlistOfferUrl } from "./waitlist-token";

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
    offerUrl: waitlistOfferUrl(updated.id, offerExpiresAt),
  });

  return { offered: true as const, entry: updated };
}

export async function acceptWaitlistOffer(ctx: AuthContext, id: string) {
  return acceptWaitlistOfferForClinic(ctx.clinicId, id);
}

export async function acceptWaitlistOfferForClinic(
  clinicId: string,
  id: string,
) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id, clinicId },
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

  const { findAvailableRoom } = await import("./rooms");
  const freeRoom = await findAvailableRoom({
    clinicId,
    startsAt: entry.offeredStartsAt,
    endsAt: entry.offeredEndsAt,
  });

  const { withScheduleLocks } = await import("./locks");
  const { assertNoConflict } = await import("./service");

  return withScheduleLocks(
    prisma,
    {
      practitionerId,
      roomId: freeRoom?.id ?? null,
      clinicId,
    },
    async (tx) => {
      const locked = await tx.waitlistEntry.findFirst({
        where: { id, clinicId },
        include: { appointmentType: true },
      });
      if (!locked || locked.status !== WaitlistStatus.OFFERED) {
        throw conflict("Offer is no longer available");
      }
      if (!locked.offeredStartsAt || !locked.offeredEndsAt) {
        throw badRequest("Offer has no slot times");
      }
      if (locked.offerExpiresAt && locked.offerExpiresAt < new Date()) {
        await tx.waitlistEntry.update({
          where: { id: locked.id },
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

      await assertNoConflict(
        {
          clinicId,
          practitionerId,
          roomId: freeRoom?.id ?? null,
          startsAt: locked.offeredStartsAt,
          endsAt: locked.offeredEndsAt,
          bufferBefore: locked.appointmentType.bufferBefore,
          bufferAfter: locked.appointmentType.bufferAfter,
        },
        tx as typeof prisma,
      );

      const appointment = await tx.appointment.create({
        data: {
          clinicId,
          patientId: locked.patientId,
          practitionerId,
          appointmentTypeId: locked.appointmentTypeId,
          roomId: freeRoom?.id ?? null,
          startsAt: locked.offeredStartsAt,
          endsAt: locked.offeredEndsAt,
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

      const updated = await tx.waitlistEntry.update({
        where: { id: locked.id },
        data: {
          status: WaitlistStatus.BOOKED,
          bookedAppointmentId: appointment.id,
        },
        include: waitlistInclude,
      });

      return { entry: updated, appointment };
    },
  ).then(async (result) => {
    try {
      const { recordScheduleAudit } = await import("./audit");
      await recordScheduleAudit({
        clinicId,
        appointmentId: result.appointment.id,
        actorId: null,
        action: "created",
        meta: {
          source: "waitlist_accept",
          waitlistEntryId: result.entry.id,
        },
      });
    } catch (err) {
      console.error("Waitlist schedule audit failed", err);
    }
    try {
      const { sendBookingConfirmation } = await import(
        "@/modules/notifications/appointments"
      );
      await sendBookingConfirmation(result.appointment.id);
    } catch (err) {
      console.error("Waitlist booking confirmation failed", err);
    }
    return result;
  });
}

export async function declineWaitlistOffer(ctx: AuthContext, id: string) {
  return declineWaitlistOfferForClinic(ctx.clinicId, id);
}

export async function declineWaitlistOfferForClinic(
  clinicId: string,
  id: string,
) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id, clinicId },
  });
  if (!entry) throw notFound("Waitlist entry not found");
  if (entry.status !== WaitlistStatus.OFFERED) {
    throw badRequest("Entry is not in OFFERED status");
  }

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
      clinicId,
      appointmentTypeId: entry.appointmentTypeId,
      practitionerId: entry.practitionerId,
      startsAt: entry.offeredStartsAt,
      endsAt: entry.offeredEndsAt,
      sourceAppointmentId: entry.bookedAppointmentId ?? entry.id,
    });
  }

  return { entry: declined, nextOffer };
}
