import { z } from "zod";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, notFound } from "@/server/errors";
import { requirePatient } from "@/modules/patients/service";

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
  startsAt: z.string().datetime(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatuses),
});

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
});

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
      visit: {
        include: {
          recording: { include: { transcript: true } },
          notes: true,
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

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + type.durationMinutes * 60_000,
  );

  await assertNoConflict({
    clinicId: ctx.clinicId,
    practitionerId: input.practitionerId,
    startsAt,
    endsAt,
    bufferBefore: type.bufferBefore,
    bufferAfter: type.bufferAfter,
  });

  return prisma.appointment.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      practitionerId: input.practitionerId,
      appointmentTypeId: input.appointmentTypeId,
      locationId: input.locationId ?? null,
      startsAt,
      endsAt,
      notes: input.notes ?? null,
      status: AppointmentStatus.BOOKED,
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
    },
  });
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

  await assertNoConflict({
    clinicId: ctx.clinicId,
    practitionerId: appointment.practitionerId,
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
    },
  });
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
    appointmentTypes: clinic.appointmentTypes,
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

  await assertNoConflict({
    clinicId: clinic.id,
    practitionerId: input.practitionerId,
    startsAt,
    endsAt,
    bufferBefore: type.bufferBefore,
    bufferAfter: type.bufferAfter,
  });

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      practitionerId: input.practitionerId,
      appointmentTypeId: type.id,
      startsAt,
      endsAt,
      status: AppointmentStatus.BOOKED,
      notes: intakeNote || null,
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
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

  return appointment;
}

async function assertNoConflict(args: {
  clinicId: string;
  practitionerId: string;
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

  const clash = await prisma.appointment.findFirst({
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

  if (clash) {
    throw conflict("Practitioner already has an appointment in this slot");
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
