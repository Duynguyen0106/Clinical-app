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
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatuses),
});

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
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

  const startsAt = new Date(input.startsAt);
  const durationMinutes = input.durationMinutes ?? type.durationMinutes;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  await assertWithinAvailability({
    clinicId: ctx.clinicId,
    practitionerId: input.practitionerId,
    startsAt,
    endsAt,
  });

  let roomId = input.roomId ?? null;
  if (!roomId) {
    const { findAvailableRoom } = await import("./rooms");
    const free = await findAvailableRoom({
      clinicId: ctx.clinicId,
      startsAt,
      endsAt,
    });
    roomId = free?.id ?? null;
  }

  await assertNoConflict({
    clinicId: ctx.clinicId,
    practitionerId: input.practitionerId,
    roomId,
    startsAt,
    endsAt,
    bufferBefore: type.bufferBefore,
    bufferAfter: type.bufferAfter,
  });

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      practitionerId: input.practitionerId,
      appointmentTypeId: input.appointmentTypeId,
      locationId: input.locationId ?? null,
      roomId,
      startsAt,
      endsAt,
      notes: input.notes ?? null,
      status: AppointmentStatus.BOOKED,
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      room: true,
    },
  });

  const feeCents =
    input.feeCents ??
    (type.defaultPriceCents > 0 ? type.defaultPriceCents : undefined);
  if (feeCents && feeCents > 0) {
    await prisma.invoice.create({
      data: {
        clinicId: ctx.clinicId,
        patientId: input.patientId,
        appointmentId: appointment.id,
        amountCents: feeCents,
        currency: "GBP",
        status: InvoiceStatus.SENT,
        issuedAt: new Date(),
      },
    });
  }

  try {
    const { sendBookingConfirmation } = await import(
      "@/modules/notifications/appointments"
    );
    await sendBookingConfirmation(appointment.id);
  } catch (err) {
    console.error("Staff booking confirmation failed", err);
  }

  return appointment;
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

  if (
    status === AppointmentStatus.CANCELLED &&
    appointment.status !== AppointmentStatus.CANCELLED
  ) {
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
) {
  const appointment = await getAppointment(ctx, id);
  const startsAt = new Date(startsAtIso);
  const duration =
    appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const endsAt = new Date(startsAt.getTime() + duration);

  await assertWithinAvailability({
    clinicId: ctx.clinicId,
    practitionerId: appointment.practitionerId,
    startsAt,
    endsAt,
  });

  await assertNoConflict({
    clinicId: ctx.clinicId,
    practitionerId: appointment.practitionerId,
    roomId: appointment.roomId,
    startsAt,
    endsAt,
    bufferBefore: appointment.appointmentType.bufferBefore,
    bufferAfter: appointment.appointmentType.bufferAfter,
    excludeAppointmentId: appointment.id,
  });

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { startsAt, endsAt },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      room: true,
    },
  });
}

export async function updateAppointment(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updateAppointmentSchema>,
) {
  if (input.status && Object.keys(input).every((k) => k === "status")) {
    return updateAppointmentStatus(ctx, id, input.status as AppointmentStatus);
  }
  if (input.startsAt && Object.keys(input).length === 1) {
    return rescheduleAppointment(ctx, id, input.startsAt);
  }

  const appointment = await getAppointment(ctx, id);
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

  if (
    startsAt.getTime() !== appointment.startsAt.getTime() ||
    endsAt.getTime() !== appointment.endsAt.getTime() ||
    (input.appointmentTypeId &&
      input.appointmentTypeId !== appointment.appointmentTypeId)
  ) {
    await assertWithinAvailability({
      clinicId: ctx.clinicId,
      practitionerId: appointment.practitionerId,
      startsAt,
      endsAt,
    });
    await assertNoConflict({
      clinicId: ctx.clinicId,
      practitionerId: appointment.practitionerId,
      roomId: appointment.roomId,
      startsAt,
      endsAt,
      bufferBefore: type.bufferBefore,
      bufferAfter: type.bufferAfter,
      excludeAppointmentId: appointment.id,
    });
  }

  let updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      startsAt,
      endsAt,
      notes,
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

  if (
    input.status === AppointmentStatus.CANCELLED &&
    appointment.status !== AppointmentStatus.CANCELLED
  ) {
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

  return updated;
}

export async function listAppointmentTypes(ctx: AuthContext) {
  return prisma.appointmentType.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    orderBy: { name: "asc" },
  });
}

export async function listPractitioners(ctx: AuthContext) {
  return prisma.practitionerProfile.findMany({
    where: { active: true, membership: { clinicId: ctx.clinicId } },
    orderBy: { displayName: "asc" },
  });
}

export async function getPublicClinicBySlug(slug: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    include: {
      appointmentTypes: { where: { active: true, onlineBookable: true } },
      memberships: {
        where: { practitionerProfile: { active: true } },
        include: { practitionerProfile: true },
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
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
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

  let patient = await prisma.patient.findFirst({
    where: {
      clinicId: clinic.id,
      email: input.patient.email,
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
  } else if (alerts) {
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        phone: input.patient.phone ?? patient.phone,
        firstName: input.patient.firstName,
        lastName: input.patient.lastName,
        alerts,
      },
    });
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

  await assertNoConflict({
    clinicId: clinic.id,
    practitionerId: input.practitionerId,
    startsAt,
    endsAt,
    bufferBefore: type.bufferBefore,
    bufferAfter: type.bufferAfter,
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

  const appointment = await prisma.appointment.create({
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

  try {
    const { sendBookingConfirmation } = await import(
      "@/modules/notifications/appointments"
    );
    await sendBookingConfirmation(appointment.id);
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
  };
}

export async function assertNoConflict(args: {
  clinicId: string;
  practitionerId: string;
  roomId?: string | null;
  startsAt: Date;
  endsAt: Date;
  bufferBefore: number;
  bufferAfter: number;
  excludeAppointmentId?: string;
}) {
  const windowStart = new Date(
    args.startsAt.getTime() - args.bufferBefore * 60_000,
  );
  const windowEnd = new Date(
    args.endsAt.getTime() + args.bufferAfter * 60_000,
  );

  const practitionerClash = await prisma.appointment.findFirst({
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
    throw conflict("Practitioner already has an appointment in this slot");
  }

  if (args.roomId) {
    const roomClash = await prisma.appointment.findFirst({
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
    if (roomClash) {
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
