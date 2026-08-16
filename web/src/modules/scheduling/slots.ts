import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { AppointmentStatus } from "@/generated/prisma/client";
import { isWindowAvailable, loadExceptions } from "./availability";
import {
  getClinicBookingPolicy,
  isSlotAllowedByPolicy,
} from "./policy";

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
}) {
  const type = await prisma.appointmentType.findFirst({
    where: {
      id: args.appointmentTypeId,
      clinicId: args.clinicId,
      active: true,
      ...(args.onlineBookableOnly ? { onlineBookable: true } : {}),
    },
  });
  if (!type) throw notFound("Appointment type not found");

  const durationMinutes = args.durationMinutes ?? type.durationMinutes;
  if (durationMinutes < 5 || durationMinutes > 8 * 60) {
    throw notFound("Invalid duration");
  }

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: args.practitionerId,
      active: true,
      membership: { clinicId: args.clinicId },
    },
    include: { availability: true },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  const policy = args.onlineBookableOnly
    ? await getClinicBookingPolicy(args.clinicId)
    : null;

  const days = args.days ?? 14;
  const limit = args.limit ?? 48;
  const now = new Date();
  const from = startOfDay(args.from ?? now);
  const to = addDays(from, days);

  const [existing, exceptions] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: args.clinicId,
        practitionerId: practitioner.id,
        startsAt: { gte: from, lte: to },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
        ...(args.excludeAppointmentId
          ? { id: { not: args.excludeAppointmentId } }
          : {}),
      },
    }),
    loadExceptions(practitioner.id, from, to),
  ]);

  // No weekly rules → fall back to 08:00–18:00 Mon–Fri so staff can still book
  const rules =
    practitioner.availability.length > 0
      ? practitioner.availability
      : [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }));

  const slots: string[] = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(from, d);
    const dow = day.getDay();
    const dayRules = rules.filter((r) => r.dayOfWeek === dow);
    for (const rule of dayRules) {
      for (
        let minute = rule.startMinute;
        minute + durationMinutes <= rule.endMinute;
        minute += 15
      ) {
        if (
          !isWindowAvailable({
            day,
            startMinute: minute,
            endMinute: minute + durationMinutes,
            rules,
            exceptions,
          })
        ) {
          continue;
        }

        const startsAt = setMinutes(
          setHours(day, Math.floor(minute / 60)),
          minute % 60,
        );
        if (startsAt <= now) continue;
        if (policy && !isSlotAllowedByPolicy(policy, startsAt, now)) continue;
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
        const windowStart = new Date(
          startsAt.getTime() - type.bufferBefore * 60_000,
        );
        const windowEnd = new Date(
          endsAt.getTime() + type.bufferAfter * 60_000,
        );
        const clash = existing.some(
          (a) => a.startsAt < windowEnd && a.endsAt > windowStart,
        );
        if (!clash) slots.push(startsAt.toISOString());
        if (slots.length >= limit) return slots;
      }
    }
  }
  return slots;
}

export async function listPublicSlots(args: {
  slug: string;
  appointmentTypeId: string;
  practitionerId: string;
  days?: number;
}) {
  const clinic = await prisma.clinic.findUnique({ where: { slug: args.slug } });
  if (!clinic) throw notFound("Clinic not found");

  return listClinicSlots({
    clinicId: clinic.id,
    appointmentTypeId: args.appointmentTypeId,
    practitionerId: args.practitionerId,
    days: args.days,
    onlineBookableOnly: true,
  });
}
