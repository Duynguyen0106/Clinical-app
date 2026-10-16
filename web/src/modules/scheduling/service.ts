import { z } from "zod";
import {
  AppointmentStatus,
  DepositStatus,
  InvoiceStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, notFound } from "@/server/errors";
import { requirePatient } from "@/modules/patients/service";
import { assertWithinAvailability } from "./availability";
import { listClinicSlots } from "./slots";
import { intervalsOverlap, withBuffers } from "./conflict";
import { withScheduleLocks } from "./locks";

const appointmentStatuses = [
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  practitionerId: z.string().min(1),
  appointmentTypeId: z.string().min(1),
  locationId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  startsAt: z.string().datetime(),
  notes: z.string().max(2000).optional().nullable(),
  /** Override type duration for this booking only */
  durationMinutes: z.number().int().min(5).max(480).optional(),
  /** Create a SENT invoice for this visit (pence). Extra fees can be added later. */
  feeCents: z.number().int().min(0).optional(),
  /**
   * Series: total occurrences including the first (2–26).
   * Same patient/practitioner/type; skips slots that conflict.
   */
  weeklyCount: z.number().int().min(2).max(26).optional(),
  /** Weeks between occurrences (1 = weekly, 2 = fortnightly). Default 1. */
  intervalWeeks: z.number().int().min(1).max(4).optional(),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatuses),
});

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
  /** When false, skip patient email/SMS (practitioner still notified). Default true. */
  notifyPatient: z.boolean().optional(),
});

export const updateAppointmentSchema = z
  .object({
    status: z.enum(appointmentStatuses).optional(),
    startsAt: z.string().datetime().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    appointmentTypeId: z.string().min(1).optional(),
    notes: z.string().max(2000).optional().nullable(),
    /** Add or top-up a linked invoice by this many pence (creates one if missing) */
    additionalFeeCents: z.number().int().positive().optional(),
    feeNote: z.string().max(200).optional(),
    /** When changing time/length: email/SMS the patient (default true) */
    notifyPatient: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.startsAt !== undefined ||
      v.durationMinutes !== undefined ||
      v.appointmentTypeId !== undefined ||
      v.notes !== undefined ||
      v.additionalFeeCents !== undefined,
    { message: "No updates provided" },
  );

function scheduleUpdateKeys(
  input: z.infer<typeof updateAppointmentSchema>,
) {
  return Object.keys(input).filter((k) => k !== "notifyPatient");
}

export async function listAppointments(
  ctx: AuthContext,
  opts: { from?: string; to?: string; practitionerId?: string } = {},
) {
  const from = opts.from ? new Date(opts.from) : startOfDay(new Date());
  const to = opts.to
    ? new Date(opts.to)
    : endOfDay(new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000));

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("Invalid from/to");
  }

  return prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      startsAt: { gte: from, lte: to },
      ...(opts.practitionerId
        ? { practitionerId: opts.practitionerId }
        : {}),
      status: { not: AppointmentStatus.CANCELLED },
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      location: true,
      room: true,
      visit: { select: { id: true, recordingConsentAt: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getAppointment(ctx: AuthContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      location: true,
      room: true,
      // Staff diary detail: visit pointers only — no note bodies / transcripts
      visit: {
        select: {
          id: true,
          recordingConsentAt: true,
          recording: { select: { id: true, status: true } },
          notes: { select: { id: true, status: true, signedAt: true } },
        },
      },
    },
  });
  if (!appointment) throw notFound("Appointment not found");
  // Reception: strip note status stubs (need-to-know)
  if (ctx.role === "RECEPTION" && appointment.visit) {
    return {
      ...appointment,
      visit: { ...appointment.visit, notes: [] },
    };
  }
  return appointment;
}

export async function createAppointment(
  ctx: AuthContext,
  input: z.infer<typeof createAppointmentSchema>,
) {
  await requirePatient(ctx.clinicId, input.patientId);

  const type = await prisma.appointmentType.findFirst({
    where: { id: input.appointmentTypeId, clinicId: ctx.clinicId, active: true },
  });
  if (!type) throw notFound("Appointment type not found");

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: input.practitionerId,
      active: true,
      membership: { clinicId: ctx.clinicId },
    },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  if (input.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: input.locationId, clinicId: ctx.clinicId },
    });
    if (!location) throw notFound("Location not found");
  }

  if (input.roomId) {
    const room = await prisma.room.findFirst({
      where: { id: input.roomId, clinicId: ctx.clinicId, active: true },
    });
    if (!room) throw notFound("Room not found");
  }

  const { assertPractitionerOffersType } = await import(
    "./practitioner-services"
  );
  await assertPractitionerOffersType({
    practitionerId: input.practitionerId,
    appointmentTypeId: input.appointmentTypeId,
  });

  const durationMinutes = input.durationMinutes ?? type.durationMinutes;
  const weeklyCount = input.weeklyCount ?? 1;
  const intervalWeeks = input.intervalWeeks ?? 1;
  const recurrenceGroupId =
    weeklyCount > 1
      ? `series_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      : null;

  const { recordScheduleAudit } = await import("./audit");
  const createdIds: string[] = [];
  let firstAppointment: Awaited<
    ReturnType<typeof createSingleStaffAppointment>
  > | null = null;
  const skipped: string[] = [];

  const firstStarts = new Date(input.startsAt);
  for (let i = 0; i < weeklyCount; i++) {
    const startsAt = new Date(
      firstStarts.getTime() +
        i * intervalWeeks * 7 * 24 * 60 * 60 * 1000,
    );
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    try {
      const appointment = await createSingleStaffAppointment(ctx, {
        patientId: input.patientId,
        practitionerId: input.practitionerId,
        appointmentTypeId: input.appointmentTypeId,
        locationId: input.locationId ?? null,
        roomId: input.roomId ?? null,
        startsAt,
        endsAt,
        notes: input.notes ?? null,
        bufferBefore: type.bufferBefore,
        bufferAfter: type.bufferAfter,
        recurrenceGroupId,
      });
      createdIds.push(appointment.id);
      if (!firstAppointment) firstAppointment = appointment;

      await recordScheduleAudit({
        clinicId: ctx.clinicId,
        appointmentId: appointment.id,
        actorId: ctx.userId,
        action: weeklyCount > 1 && i === 0 ? "series_created" : "created",
        meta: {
          startsAt: startsAt.toISOString(),
          practitionerId: input.practitionerId,
          recurrenceGroupId,
          seriesIndex: i + 1,
          seriesCount: weeklyCount,
          intervalWeeks,
        },
      });
    } catch (err) {
      if (i === 0) throw err;
      skipped.push(startsAt.toISOString());
      console.warn("Weekly series skip", startsAt.toISOString(), err);
    }
  }

  if (!firstAppointment) throw badRequest("Could not create appointment");

  const feeCents =
    input.feeCents ??
    (type.defaultPriceCents > 0 ? type.defaultPriceCents : undefined);
  if (feeCents && feeCents > 0) {
    await prisma.invoice.create({
      data: {
        clinicId: ctx.clinicId,
        patientId: input.patientId,
        appointmentId: firstAppointment.id,
        amountCents: feeCents,
        currency: "GBP",
        status: InvoiceStatus.SENT,
        issuedAt: new Date(),
      },
    });
  }

  let confirmation: Awaited<
    ReturnType<
      typeof import("@/modules/notifications/appointments").sendBookingConfirmation
    >
  > = null;
  try {
    const { sendBookingConfirmation } = await import(
      "@/modules/notifications/appointments"
    );
    confirmation = await sendBookingConfirmation(firstAppointment.id, {
      source: "staff",
    });
  } catch (err) {
    console.error("Staff booking confirmation failed", err);
  }

  return Object.assign(firstAppointment, {
    confirmation,
    series: {
      recurrenceGroupId,
      createdCount: createdIds.length,
      requestedCount: weeklyCount,
      intervalWeeks,
      appointmentIds: createdIds,
      skippedStartsAt: skipped,
    },
  });
}

/**
 * Cancel this appointment and all later BOOKED/CONFIRMED siblings in the series.
 */
export async function cancelFutureSeries(ctx: AuthContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!appointment) throw notFound("Appointment not found");
  if (!appointment.recurrenceGroupId) {
    throw badRequest("This appointment is not part of a series");
  }

  const siblings = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      recurrenceGroupId: appointment.recurrenceGroupId,
      startsAt: { gte: appointment.startsAt },
      status: {
        in: [AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED],
      },
    },
    orderBy: { startsAt: "asc" },
  });

  if (siblings.length === 0) {
    throw badRequest("No future series appointments to cancel");
  }

  const { recordScheduleAudit } = await import("./audit");
  const cancelledIds: string[] = [];

  for (const sibling of siblings) {
    await prisma.appointment.update({
      where: { id: sibling.id },
      data: { status: AppointmentStatus.CANCELLED },
    });
    cancelledIds.push(sibling.id);
    await recordScheduleAudit({
      clinicId: ctx.clinicId,
      appointmentId: sibling.id,
      actorId: ctx.userId,
      action: "series_cancelled",
      meta: {
        recurrenceGroupId: appointment.recurrenceGroupId,
        fromAppointmentId: appointment.id,
        startsAt: sibling.startsAt.toISOString(),
      },
    });
  }

  // Notify patient once for the anchor appointment
  try {
    const { sendAppointmentCancelled } = await import(
      "@/modules/notifications/appointments"
    );
    await sendAppointmentCancelled(appointment.id);
  } catch (err) {
    console.error("Series cancel notification failed", err);
  }

  return {
    recurrenceGroupId: appointment.recurrenceGroupId,
    cancelledCount: cancelledIds.length,
    cancelledIds,
  };
}

async function createSingleStaffAppointment(
  ctx: AuthContext,
  opts: {
    patientId: string;
    practitionerId: string;
    appointmentTypeId: string;
    locationId: string | null;
    roomId: string | null;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
    bufferBefore: number;
    bufferAfter: number;
    recurrenceGroupId: string | null;
  },
) {
  await assertWithinAvailability({
    clinicId: ctx.clinicId,
    practitionerId: opts.practitionerId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
  });

  let roomId = opts.roomId;
  if (!roomId) {
    const { findAvailableRoom } = await import("./rooms");
    const free = await findAvailableRoom({
      clinicId: ctx.clinicId,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
    });
    roomId = free?.id ?? null;
  }

  return withScheduleLocks(
    prisma,
    { practitionerId: opts.practitionerId, roomId },
    async (tx) => {
      await assertNoConflict(
        {
          clinicId: ctx.clinicId,
          practitionerId: opts.practitionerId,
          roomId,
          startsAt: opts.startsAt,
          endsAt: opts.endsAt,
          bufferBefore: opts.bufferBefore,
          bufferAfter: opts.bufferAfter,
        },
        tx as typeof prisma,
      );

      return tx.appointment.create({
        data: {
          clinicId: ctx.clinicId,
          patientId: opts.patientId,
          practitionerId: opts.practitionerId,
          appointmentTypeId: opts.appointmentTypeId,
          locationId: opts.locationId,
          roomId,
          startsAt: opts.startsAt,
          endsAt: opts.endsAt,
          notes: opts.notes,
          status: AppointmentStatus.BOOKED,
          recurrenceGroupId: opts.recurrenceGroupId,
        },
        include: {
          patient: true,
          practitioner: true,
          appointmentType: true,
          room: true,
        },
      });
    },
  );
}

export async function updateAppointmentStatus(
  ctx: AuthContext,
  id: string,
  status: AppointmentStatus,
) {
  const appointment = await getAppointment(ctx, id);
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
    },
  });

  const { recordScheduleAudit } = await import("./audit");
  const cancelled =
    status === AppointmentStatus.CANCELLED &&
    appointment.status !== AppointmentStatus.CANCELLED;

  await recordScheduleAudit({
    clinicId: ctx.clinicId,
    appointmentId: appointment.id,
    actorId: ctx.userId,
    action: cancelled ? "cancelled" : "status_changed",
    meta: {
      fromStatus: appointment.status,
      toStatus: status,
      startsAt: appointment.startsAt.toISOString(),
    },
  });

  if (cancelled) {
    try {
      const { sendAppointmentCancelled } = await import(
        "@/modules/notifications/appointments"
      );
      await sendAppointmentCancelled(appointment.id);
    } catch (err) {
      console.error("Cancel notification failed", err);
    }

    const { offerSlotToWaitlist } = await import("./waitlist");
    const offer = await offerSlotToWaitlist({
      clinicId: ctx.clinicId,
      appointmentTypeId: appointment.appointmentTypeId,
      practitionerId: appointment.practitionerId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      sourceAppointmentId: appointment.id,
    });
    return { ...updated, waitlistOffer: offer };
  }

  return updated;
}

export async function rescheduleAppointment(
  ctx: AuthContext,
  id: string,
  startsAtIso: string,
  opts: { notifyPatient?: boolean } = {},
) {
  const appointment = await getAppointment(ctx, id);
  const previousStartsAt = appointment.startsAt;
  const startsAt = new Date(startsAtIso);
  const duration =
    appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const endsAt = new Date(startsAt.getTime() + duration);
  const notifyPatient = opts.notifyPatient !== false;

  await assertWithinAvailability({
    clinicId: ctx.clinicId,
    practitionerId: appointment.practitionerId,
    startsAt,
    endsAt,
  });

  const updated = await withScheduleLocks(
    prisma,
    {
      practitionerId: appointment.practitionerId,
      roomId: appointment.roomId,
    },
    async (tx) => {
      await assertNoConflict(
        {
          clinicId: ctx.clinicId,
          practitionerId: appointment.practitionerId,
          roomId: appointment.roomId,
          startsAt,
          endsAt,
          bufferBefore: appointment.appointmentType.bufferBefore,
          bufferAfter: appointment.appointmentType.bufferAfter,
          excludeAppointmentId: appointment.id,
        },
        tx as typeof prisma,
      );

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
          // New time should get a fresh reminder window
          reminderSentAt: null,
          smsReminderSentAt: null,
        },
        include: {
          patient: true,
          practitioner: true,
          appointmentType: true,
          room: true,
        },
      });
    },
  );

  let notification: {
    patientEmailSent: boolean;
    patientSmsSent: boolean;
    practitionerEmailSent: boolean;
    patientNotified: boolean;
  } | null = null;

  const { recordScheduleAudit } = await import("./audit");
  await recordScheduleAudit({
    clinicId: ctx.clinicId,
    appointmentId: updated.id,
    actorId: ctx.userId,
    action: "rescheduled",
    meta: {
      fromStartsAt: previousStartsAt.toISOString(),
      toStartsAt: updated.startsAt.toISOString(),
      notifyPatient,
    },
  });

  try {
    const { sendAppointmentRescheduled } = await import(
      "@/modules/notifications/appointments"
    );
    const result = await sendAppointmentRescheduled({
      appointmentId: updated.id,
      previousStartsAt,
      notifyPatient,
    });
    if (result) {
      notification = {
        ...result,
        patientNotified: result.patientEmailSent || result.patientSmsSent,
      };
    }
  } catch (err) {
    console.error("Reschedule notification failed", err);
  }

  return Object.assign(updated, { notification });
}

export async function updateAppointment(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updateAppointmentSchema>,
) {
  const keys = scheduleUpdateKeys(input);
  if (input.status && keys.every((k) => k === "status")) {
    return updateAppointmentStatus(ctx, id, input.status as AppointmentStatus);
  }
  if (input.startsAt && keys.every((k) => k === "startsAt")) {
    return rescheduleAppointment(ctx, id, input.startsAt, {
      notifyPatient: input.notifyPatient,
    });
  }

  const appointment = await getAppointment(ctx, id);
  const previousStartsAt = appointment.startsAt;
  let type = appointment.appointmentType;
  let startsAt = appointment.startsAt;
  let endsAt = appointment.endsAt;
  let notes = appointment.notes;

  if (input.appointmentTypeId) {
    const next = await prisma.appointmentType.findFirst({
      where: {
        id: input.appointmentTypeId,
        clinicId: ctx.clinicId,
        active: true,
      },
    });
    if (!next) throw notFound("Appointment type not found");
    type = next;
    if (input.durationMinutes === undefined && input.startsAt === undefined) {
      const durationMs = type.durationMinutes * 60_000;
      endsAt = new Date(startsAt.getTime() + durationMs);
    }
  }

  if (input.startsAt) {
    startsAt = new Date(input.startsAt);
  }

  if (input.durationMinutes !== undefined) {
    endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  } else if (input.startsAt && input.appointmentTypeId === undefined) {
    const duration =
      appointment.endsAt.getTime() - appointment.startsAt.getTime();
    endsAt = new Date(startsAt.getTime() + duration);
  }

  if (input.notes !== undefined) notes = input.notes;

  const scheduleChanged =
    startsAt.getTime() !== appointment.startsAt.getTime() ||
    endsAt.getTime() !== appointment.endsAt.getTime();

  if (
    scheduleChanged ||
    (input.appointmentTypeId &&
      input.appointmentTypeId !== appointment.appointmentTypeId)
  ) {
    await assertWithinAvailability({
      clinicId: ctx.clinicId,
      practitionerId: appointment.practitionerId,
      startsAt,
      endsAt,
    });
  }

  let updated = await withScheduleLocks(
    prisma,
    {
      practitionerId: appointment.practitionerId,
      roomId: appointment.roomId,
    },
    async (tx) => {
      if (
        scheduleChanged ||
        (input.appointmentTypeId &&
          input.appointmentTypeId !== appointment.appointmentTypeId)
      ) {
        await assertNoConflict(
          {
            clinicId: ctx.clinicId,
            practitionerId: appointment.practitionerId,
            roomId: appointment.roomId,
            startsAt,
            endsAt,
            bufferBefore: type.bufferBefore,
            bufferAfter: type.bufferAfter,
            excludeAppointmentId: appointment.id,
          },
          tx as typeof prisma,
        );
      }

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
          notes,
          ...(scheduleChanged
            ? { reminderSentAt: null, smsReminderSentAt: null }
            : {}),
          ...(input.appointmentTypeId
            ? { appointmentTypeId: input.appointmentTypeId }
            : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          patient: true,
          practitioner: true,
          appointmentType: true,
          room: true,
        },
      });
    },
  );

  let notification: {
    patientEmailSent: boolean;
    patientSmsSent: boolean;
    practitionerEmailSent: boolean;
    patientNotified: boolean;
  } | null = null;

  if (scheduleChanged) {
    try {
      const { sendAppointmentRescheduled } = await import(
        "@/modules/notifications/appointments"
      );
      const result = await sendAppointmentRescheduled({
        appointmentId: updated.id,
        previousStartsAt,
        notifyPatient: input.notifyPatient,
      });
      if (result) {
        notification = {
          ...result,
          patientNotified: result.patientEmailSent || result.patientSmsSent,
        };
      }
    } catch (err) {
      console.error("Schedule-change notification failed", err);
    }
  }

  if (
    input.status === AppointmentStatus.CANCELLED &&
    appointment.status !== AppointmentStatus.CANCELLED
  ) {
    try {
      const { sendAppointmentCancelled } = await import(
        "@/modules/notifications/appointments"
      );
      await sendAppointmentCancelled(appointment.id);
    } catch (err) {
      console.error("Cancel notification failed", err);
    }

    const { offerSlotToWaitlist } = await import("./waitlist");
    const offer = await offerSlotToWaitlist({
      clinicId: ctx.clinicId,
      appointmentTypeId: updated.appointmentTypeId,
      practitionerId: updated.practitionerId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      sourceAppointmentId: appointment.id,
    });
    updated = { ...updated, waitlistOffer: offer } as typeof updated;
  }

  if (input.additionalFeeCents) {
    const existing = await prisma.invoice.findFirst({
      where: {
        clinicId: ctx.clinicId,
        appointmentId: appointment.id,
        status: { not: InvoiceStatus.VOID },
      },
      orderBy: { createdAt: "desc" },
    });
    const noteBit = input.feeNote?.trim();
    if (existing) {
      await prisma.invoice.update({
        where: { id: existing.id },
        data: {
          amountCents: existing.amountCents + input.additionalFeeCents,
          status:
            existing.status === InvoiceStatus.PAID
              ? existing.status
              : InvoiceStatus.SENT,
        },
      });
    } else {
      await prisma.invoice.create({
        data: {
          clinicId: ctx.clinicId,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          amountCents: input.additionalFeeCents,
          currency: "GBP",
          status: InvoiceStatus.SENT,
          issuedAt: new Date(),
        },
      });
    }
    if (noteBit) {
      const prior = updated.notes ? `${updated.notes}\n` : "";
      updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          notes: `${prior}Fee: ${noteBit} (+£${(input.additionalFeeCents / 100).toFixed(2)})`,
        },
        include: {
          patient: true,
          practitioner: true,
          appointmentType: true,
          room: true,
        },
      });
    }
  }

  return Object.assign(updated, { notification });
}

export async function listAppointmentTypes(ctx: AuthContext) {
  return prisma.appointmentType.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    orderBy: { name: "asc" },
  });
}

export async function listPractitioners(ctx: AuthContext) {
  const rows = await prisma.practitionerProfile.findMany({
    where: { active: true, membership: { clinicId: ctx.clinicId } },
    include: {
      availability: {
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      services: { select: { appointmentTypeId: true } },
    },
    orderBy: { displayName: "asc" },
  });
  return rows.map(({ services, ...p }) => ({
    ...p,
    /** null = all clinic services */
    appointmentTypeIds:
      services.length === 0 ? null : services.map((s) => s.appointmentTypeId),
  }));
}

export async function getPublicClinicBySlug(slug: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    include: {
      appointmentTypes: { where: { active: true, onlineBookable: true } },
      memberships: {
        where: { practitionerProfile: { active: true } },
        include: {
          practitionerProfile: {
            include: {
              services: { select: { appointmentTypeId: true } },
            },
          },
        },
      },
      locations: { where: { active: true } },
    },
  });
  if (!clinic) throw notFound("Clinic not found");

  return {
    id: clinic.id,
    name: clinic.name,
    slug: clinic.slug,
    timezone: clinic.timezone,
    phone: clinic.phone,
    email: clinic.email,
    address: clinic.address,
    brandColour: clinic.brandColour,
    hasLogo: Boolean(clinic.logoStorageKey),
    logoUrl: clinic.logoStorageKey
      ? `/api/v1/public/clinics/${clinic.slug}/logo`
      : null,
    booking: {
      minNoticeHours: clinic.bookingMinNoticeHours,
      maxAdvanceDays: clinic.bookingMaxAdvanceDays,
      cancelMinNoticeHours: clinic.cancelMinNoticeHours,
      depositMode: clinic.depositMode,
      depositDefaultCents: clinic.depositDefaultCents,
      policyText: clinic.bookingPolicyText,
    },
    appointmentTypes: clinic.appointmentTypes.map((t) => ({
      ...t,
      effectiveDepositCents:
        t.depositCents ?? clinic.depositDefaultCents,
    })),
    practitioners: clinic.memberships
      .map((m) => m.practitionerProfile)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map(({ services, ...p }) => ({
        ...p,
        appointmentTypeIds:
          services.length === 0
            ? null
            : services.map((s) => s.appointmentTypeId),
      })),
    locations: clinic.locations,
  };
}

export const publicBookSchema = z.object({
  appointmentTypeId: z.string().min(1),
  practitionerId: z.string().min(1),
  startsAt: z.string().datetime(),
  patient: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  intake: z
    .object({
      reasonForVisit: z.string().max(1000).optional(),
      privacyConsent: z.literal(true),
      recordingConsentPreferred: z.boolean().optional(),
    })
    .optional(),
  captchaToken: z.string().min(1).optional(),
});

export async function publicBook(slug: string, input: z.infer<typeof publicBookSchema>) {
  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  if (!clinic) throw notFound("Clinic not found");

  const type = await prisma.appointmentType.findFirst({
    where: {
      id: input.appointmentTypeId,
      clinicId: clinic.id,
      active: true,
      onlineBookable: true,
    },
  });
  if (!type) throw notFound("Appointment type not found");

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: input.practitionerId,
      active: true,
      membership: { clinicId: clinic.id },
    },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  const { assertPractitionerOffersType } = await import(
    "./practitioner-services"
  );
  await assertPractitionerOffersType({
    practitionerId: input.practitionerId,
    appointmentTypeId: input.appointmentTypeId,
  });

  let patient = await prisma.patient.findFirst({
    where: {
      clinicId: clinic.id,
      email: input.patient.email,
      archivedAt: null,
    },
  });

  const intakeNote = input.intake?.reasonForVisit?.trim();
  const alerts = [
    patient?.alerts,
    intakeNote ? `Intake: ${intakeNote}` : null,
    input.intake?.recordingConsentPreferred
      ? "Prefers recording for clinical notes (confirm at visit)"
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: input.patient.firstName,
        lastName: input.patient.lastName,
        email: input.patient.email,
        phone: input.patient.phone ?? null,
        alerts: alerts || null,
      },
    });
  } else {
    // Match by email and attach the booking only — never overwrite
    // demographics or clinical alerts from an unauthenticated form.
    if (!patient.phone && input.patient.phone) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: { phone: input.patient.phone },
      });
    }
  }

  if (input.intake?.privacyConsent) {
    await prisma.patientConsent.create({
      data: {
        patientId: patient.id,
        type: "PRIVACY_POLICY",
        granted: true,
        method: "online_form",
      },
    });
  }
  if (input.intake?.recordingConsentPreferred) {
    await prisma.patientConsent.create({
      data: {
        patientId: patient.id,
        type: "RECORDING",
        granted: true,
        method: "online_form",
        meta: { preferred: true, confirmAtVisit: true } as object,
      },
    });
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + type.durationMinutes * 60_000,
  );

  const { assertSlotWithinBookingWindow } = await import("./policy");
  const { resolveDepositRequirement } = await import("./policy");
  const policy = await (
    await import("./policy")
  ).getClinicBookingPolicy(clinic.id);
  assertSlotWithinBookingWindow(policy, startsAt);

  const openSlots = await listClinicSlots({
    clinicId: clinic.id,
    appointmentTypeId: type.id,
    practitionerId: input.practitionerId,
    days: Math.max(policy.bookingMaxAdvanceDays, 21),
    onlineBookableOnly: true,
    limit: 200,
  });
  const slotOk = openSlots.some(
    (s) => Math.abs(new Date(s).getTime() - startsAt.getTime()) < 60_000,
  );
  if (!slotOk) {
    throw conflict("That slot is no longer available");
  }

  await assertWithinAvailability({
    clinicId: clinic.id,
    practitionerId: input.practitionerId,
    startsAt,
    endsAt,
  });

  const { findAvailableRoom } = await import("./rooms");
  const freeRoom = await findAvailableRoom({
    clinicId: clinic.id,
    startsAt,
    endsAt,
  });

  const deposit = await resolveDepositRequirement({
    clinicId: clinic.id,
    appointmentTypeId: type.id,
    patientId: patient.id,
    isOnline: true,
  });

  const appointment = await withScheduleLocks(
    prisma,
    {
      practitionerId: input.practitionerId,
      roomId: freeRoom?.id ?? null,
    },
    async (tx) => {
      await assertNoConflict(
        {
          clinicId: clinic.id,
          practitionerId: input.practitionerId,
          roomId: freeRoom?.id ?? null,
          startsAt,
          endsAt,
          bufferBefore: type.bufferBefore,
          bufferAfter: type.bufferAfter,
        },
        tx as typeof prisma,
      );

      return tx.appointment.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          practitionerId: input.practitionerId,
          appointmentTypeId: type.id,
          roomId: freeRoom?.id ?? null,
          startsAt,
          endsAt,
          status: AppointmentStatus.BOOKED,
          notes: intakeNote || null,
          depositCents: deposit.required ? deposit.cents : 0,
          depositStatus: deposit.required
            ? DepositStatus.REQUIRED
            : DepositStatus.NONE,
        },
        include: {
          patient: true,
          practitioner: true,
          appointmentType: true,
          room: true,
          clinic: true,
        },
      });
    },
  );

  const { recordScheduleAudit } = await import("./audit");
  await recordScheduleAudit({
    clinicId: clinic.id,
    appointmentId: appointment.id,
    actorId: null,
    action: "created",
    meta: { source: "public_book", practitionerId: input.practitionerId },
  });

  let confirmation: Awaited<
    ReturnType<
      typeof import("@/modules/notifications/appointments").sendBookingConfirmation
    >
  > = null;
  try {
    const { sendBookingConfirmation } = await import(
      "@/modules/notifications/appointments"
    );
    confirmation = await sendBookingConfirmation(appointment.id);
  } catch (err) {
    console.error("Booking confirmation email failed", err);
  }

  let depositCheckout: {
    status: string;
    depositCents: number;
    checkoutUrl: string | null;
    provider?: string;
  } | null = null;
  if (deposit.required) {
    try {
      const { createDepositCheckout } = await import(
        "@/modules/billing/deposits"
      );
      depositCheckout = await createDepositCheckout(appointment.id);
    } catch (err) {
      console.error("Deposit checkout failed", err);
    }
  }

  const fresh = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.id },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      room: true,
      clinic: true,
    },
  });

  return {
    appointment: fresh,
    deposit: depositCheckout,
    policyText: policy.bookingPolicyText,
    confirmation,
  };
}

export async function assertNoConflict(
  args: {
    clinicId: string;
    practitionerId: string;
    roomId?: string | null;
    startsAt: Date;
    endsAt: Date;
    bufferBefore: number;
    bufferAfter: number;
    excludeAppointmentId?: string;
  },
  db: typeof prisma = prisma,
) {
  const { windowStart, windowEnd } = withBuffers(
    args.startsAt,
    args.endsAt,
    args.bufferBefore,
    args.bufferAfter,
  );

  const practitionerClash = await db.appointment.findFirst({
    where: {
      clinicId: args.clinicId,
      practitionerId: args.practitionerId,
      status: {
        notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      },
      ...(args.excludeAppointmentId
        ? { id: { not: args.excludeAppointmentId } }
        : {}),
      AND: [
        { startsAt: { lt: windowEnd } },
        { endsAt: { gt: windowStart } },
      ],
    },
  });

  if (practitionerClash) {
    // Harden detection with pure overlap helper (same semantics as query)
    if (
      intervalsOverlap(
        windowStart,
        windowEnd,
        practitionerClash.startsAt,
        practitionerClash.endsAt,
      )
    ) {
      throw conflict("Practitioner already has an appointment in this slot");
    }
  }

  if (args.roomId) {
    const roomClash = await db.appointment.findFirst({
      where: {
        clinicId: args.clinicId,
        roomId: args.roomId,
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
        ...(args.excludeAppointmentId
          ? { id: { not: args.excludeAppointmentId } }
          : {}),
        AND: [
          { startsAt: { lt: windowEnd } },
          { endsAt: { gt: windowStart } },
        ],
      },
    });
    if (
      roomClash &&
      intervalsOverlap(
        windowStart,
        windowEnd,
        roomClash.startsAt,
        roomClash.endsAt,
      )
    ) {
      throw conflict("Room is already booked in this slot");
    }
  }
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
