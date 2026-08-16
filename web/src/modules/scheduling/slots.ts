import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { AppointmentStatus } from "@/generated/prisma/client";

export async function listClinicSlots(args: {
  clinicId: string;
  appointmentTypeId: string;
  practitionerId: string;
  days?: number;
  from?: Date;
  onlineBookableOnly?: boolean;
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

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: args.practitionerId,
      active: true,
      membership: { clinicId: args.clinicId },
    },
    include: { availability: true },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  const days = args.days ?? 14;
  const now = new Date();
  const from = startOfDay(args.from ?? now);
  const to = addDays(from, days);

  const existing = await prisma.appointment.findMany({
    where: {
      clinicId: args.clinicId,
      practitionerId: practitioner.id,
      startsAt: { gte: from, lte: to },
      status: {
        notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      },
    },
  });

  const slots: string[] = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(from, d);
    const dow = day.getDay();
    const rules = practitioner.availability.filter((r) => r.dayOfWeek === dow);
    for (const rule of rules) {
      for (
        let minute = rule.startMinute;
        minute + type.durationMinutes <= rule.endMinute;
        minute += 15
      ) {
        const startsAt = setMinutes(
          setHours(day, Math.floor(minute / 60)),
          minute % 60,
        );
        if (startsAt <= now) continue;
        const endsAt = new Date(
          startsAt.getTime() + type.durationMinutes * 60_000,
        );
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
        if (slots.length >= 24) return slots;
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
