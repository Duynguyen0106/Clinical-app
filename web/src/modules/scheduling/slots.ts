import { addDays } from "date-fns";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { AppointmentStatus } from "@/generated/prisma/client";
import { isWindowAvailable, loadExceptions } from "./availability";
import {
  clinicDateKey,
  clinicDayOfWeek,
  clinicLocalDateTime,
} from "./clinic-time";
import {
  getClinicBookingPolicy,
  isSlotAllowedByPolicy,
  type BookingPolicy,
} from "./policy";
import { publicSlotWindow } from "./public-slot-window";

export { publicSlotWindow } from "./public-slot-window";

type SlotType = {
  id: string;
  durationMinutes: number;
  bufferBefore: number;
  bufferAfter: number;
};

function clashes(
  existing: { startsAt: Date; endsAt: Date }[],
  windowStart: Date,
  windowEnd: Date,
) {
  for (const a of existing) {
    if (a.startsAt < windowEnd && a.endsAt > windowStart) return true;
  }
  return false;
}

async function generateSlotsForPractitioner(args: {
  clinicId: string;
  practitionerId: string;
  type: SlotType;
  durationMinutes: number;
  timeZone: string;
  policy: BookingPolicy | null;
  days: number;
  limit: number;
  maxPerDay?: number;
  from?: Date;
  excludeAppointmentId?: string;
}) {
  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: args.practitionerId,
      active: true,
      membership: { clinicId: args.clinicId },
    },
    include: { availability: true },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  const now = new Date();
  const fromKey = clinicDateKey(args.from ?? now, args.timeZone);
  const fromUtc = clinicLocalDateTime(fromKey, 0, args.timeZone);
  const toUtc = addDays(fromUtc, args.days);

  const [existing, exceptions] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: args.clinicId,
        practitionerId: practitioner.id,
        startsAt: { gte: fromUtc, lte: toUtc },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
        ...(args.excludeAppointmentId
          ? { id: { not: args.excludeAppointmentId } }
          : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
    loadExceptions(practitioner.id, fromUtc, toUtc),
  ]);

  const rules =
    practitioner.availability.length > 0
      ? practitioner.availability
      : [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }));

  const slots: string[] = [];
  const maxPerDay = args.maxPerDay ?? Number.POSITIVE_INFINITY;

  for (let d = 0; d < args.days; d++) {
    const dayUtc = addDays(fromUtc, d);
    const dateKey = clinicDateKey(dayUtc, args.timeZone);
    const dow = clinicDayOfWeek(dayUtc, args.timeZone);
    const dayRules = rules.filter((r) => r.dayOfWeek === dow);
    let dayCount = 0;
    dayLoop: for (const rule of dayRules) {
      for (
        let minute = rule.startMinute;
        minute + args.durationMinutes <= rule.endMinute;
        minute += 15
      ) {
        if (
          !isWindowAvailable({
            day: dayUtc,
            startMinute: minute,
            endMinute: minute + args.durationMinutes,
            rules,
            exceptions,
            timeZone: args.timeZone,
          })
        ) {
          continue;
        }

        const startsAt = clinicLocalDateTime(dateKey, minute, args.timeZone);
        if (startsAt <= now) continue;
        if (
          args.policy &&
          !isSlotAllowedByPolicy(args.policy, startsAt, now)
        ) {
          continue;
        }
        const endsAt = new Date(
          startsAt.getTime() + args.durationMinutes * 60_000,
        );
        const windowStart = new Date(
          startsAt.getTime() - args.type.bufferBefore * 60_000,
        );
        const windowEnd = new Date(
          endsAt.getTime() + args.type.bufferAfter * 60_000,
        );
        if (clashes(existing, windowStart, windowEnd)) continue;

        slots.push(startsAt.toISOString());
        dayCount += 1;
        if (slots.length >= args.limit) return slots;
        if (dayCount >= maxPerDay) break dayLoop;
      }
    }
  }
  return slots;
}

export async function listClinicSlots(args: {
  clinicId: string;
  appointmentTypeId: string;
  practitionerId: string;
  days?: number;
  from?: Date;
  onlineBookableOnly?: boolean;
  /** Override type duration (minutes) for custom-length bookings */
  durationMinutes?: number;
  excludeAppointmentId?: string;
  /** Cap returned slots (default 48) */
  limit?: number;
  /** Cap open times returned per calendar day (public booking) */
  maxPerDay?: number;
}) {
  const type = await prisma.appointmentType.findFirst({
    where: {
      id: args.appointmentTypeId,
      clinicId: args.clinicId,
      active: true,
      ...(args.onlineBookableOnly ? { onlineBookable: true } : {}),
    },
    select: {
      id: true,
      durationMinutes: true,
      bufferBefore: true,
      bufferAfter: true,
    },
  });
  if (!type) throw notFound("Appointment type not found");

  const { assertPractitionerOffersType } = await import(
    "./practitioner-services"
  );
  await assertPractitionerOffersType({
    practitionerId: args.practitionerId,
    appointmentTypeId: args.appointmentTypeId,
  });

  const durationMinutes = args.durationMinutes ?? type.durationMinutes;
  if (durationMinutes < 5 || durationMinutes > 8 * 60) {
    throw notFound("Invalid duration");
  }

  const clinic = await prisma.clinic.findFirst({
    where: { id: args.clinicId },
    select: { timezone: true },
  });
  const timeZone = clinic?.timezone ?? "Europe/London";

  const policy = args.onlineBookableOnly
    ? await getClinicBookingPolicy(args.clinicId)
    : null;

  return generateSlotsForPractitioner({
    clinicId: args.clinicId,
    practitionerId: args.practitionerId,
    type,
    durationMinutes,
    timeZone,
    policy,
    days: args.days ?? 14,
    limit: args.limit ?? 48,
    maxPerDay: args.maxPerDay,
    from: args.from,
    excludeAppointmentId: args.excludeAppointmentId,
  });
}

export async function listPublicSlots(args: {
  slug: string;
  appointmentTypeId: string;
  practitionerId: string;
  days?: number;
}) {
  const clinic = await prisma.clinic.findUnique({
    where: { slug: args.slug },
    select: { id: true, timezone: true },
  });
  if (!clinic) throw notFound("Clinic not found");

  const policy = await getClinicBookingPolicy(clinic.id);
  const { days, limit, maxPerDay } = publicSlotWindow({
    maxAdvanceDays: policy.bookingMaxAdvanceDays,
    days: args.days,
  });

  return listClinicSlots({
    clinicId: clinic.id,
    appointmentTypeId: args.appointmentTypeId,
    practitionerId: args.practitionerId,
    days,
    limit,
    maxPerDay,
    onlineBookableOnly: true,
  });
}

export type PublicMultiSlot = {
  startsAt: string;
  practitionerId: string;
  practitionerName: string;
};

/** One pass for “any practitioner” booking — avoids N client fan-out calls. */
export async function listPublicMultiPractitionerSlots(args: {
  slug: string;
  appointmentTypeId: string;
  days?: number;
}): Promise<PublicMultiSlot[]> {
  const clinic = await prisma.clinic.findUnique({
    where: { slug: args.slug },
    select: { id: true, timezone: true },
  });
  if (!clinic) throw notFound("Clinic not found");

  const type = await prisma.appointmentType.findFirst({
    where: {
      id: args.appointmentTypeId,
      clinicId: clinic.id,
      active: true,
      onlineBookable: true,
    },
    select: {
      id: true,
      durationMinutes: true,
      bufferBefore: true,
      bufferAfter: true,
    },
  });
  if (!type) throw notFound("Appointment type not found");

  const [policy, practitioners] = await Promise.all([
    getClinicBookingPolicy(clinic.id),
    prisma.practitionerProfile.findMany({
      where: {
        active: true,
        membership: { clinicId: clinic.id },
        OR: [
          { services: { none: {} } },
          {
            services: {
              some: { appointmentTypeId: args.appointmentTypeId },
            },
          },
        ],
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const { days, limit, maxPerDay } = publicSlotWindow({
    maxAdvanceDays: policy.bookingMaxAdvanceDays,
    days: args.days,
  });
  const timeZone = clinic.timezone ?? "Europe/London";
  const perPracLimit = Math.max(24, Math.ceil(limit / Math.max(practitioners.length, 1)));

  const groups = await Promise.all(
    practitioners.map(async (p) => {
      try {
        const slots = await generateSlotsForPractitioner({
          clinicId: clinic.id,
          practitionerId: p.id,
          type,
          durationMinutes: type.durationMinutes,
          timeZone,
          policy,
          days,
          limit: perPracLimit,
          maxPerDay,
        });
        return slots.map((startsAt) => ({
          startsAt,
          practitionerId: p.id,
          practitionerName: p.displayName,
        }));
      } catch {
        return [] as PublicMultiSlot[];
      }
    }),
  );

  return groups
    .flat()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit);
}
