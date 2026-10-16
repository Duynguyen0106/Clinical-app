import { z } from "zod";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { isLeaveReason } from "@/modules/scheduling/leave-schema";
import {
  clinicDateKey,
  clinicDayOfWeek,
  clinicMinutesFromMidnight,
  utcDateKey,
} from "./clinic-time";

export const createBlockSchema = z.object({
  practitionerId: z.string().min(1),
  /** Calendar date YYYY-MM-DD in clinic local intent (stored as UTC date) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Omit both for a full-day block */
  startMinute: z.number().int().min(0).max(24 * 60 - 1).optional().nullable(),
  endMinute: z.number().int().min(1).max(24 * 60).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
});

function parseDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function listBlocks(
  ctx: AuthContext,
  opts: {
    from?: string;
    to?: string;
    practitionerId?: string;
    /** Calendar UI hides leave; booking availability still uses loadExceptions */
    calendarOnly?: boolean;
  } = {},
) {
  const from = opts.from ? parseDateOnly(opts.from.slice(0, 10)) : undefined;
  const to = opts.to ? parseDateOnly(opts.to.slice(0, 10)) : undefined;
  const calendarOnly = opts.calendarOnly !== false;

  // Legacy day-list leave was stored as BLOCK + "Annual leave" reason — hide those too
  if (calendarOnly) {
    await prisma.availabilityException.updateMany({
      where: {
        kind: "BLOCK",
        practitioner: {
          membership: { clinicId: ctx.clinicId },
        },
        OR: [
          { reason: { contains: "leave", mode: "insensitive" } },
          { reason: { contains: "CPD", mode: "insensitive" } },
          { reason: { equals: "Training / CPD" } },
        ],
      },
      data: { kind: "LEAVE" },
    });
  }

  return prisma.availabilityException.findMany({
    where: {
      practitioner: {
        membership: { clinicId: ctx.clinicId },
        ...(opts.practitionerId ? { id: opts.practitionerId } : {}),
      },
      isAvailable: false,
      ...(calendarOnly ? { kind: "BLOCK" } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });
}

export async function createBlock(
  ctx: AuthContext,
  input: z.infer<typeof createBlockSchema>,
) {
  const hasStart = input.startMinute != null;
  const hasEnd = input.endMinute != null;
  if (hasStart !== hasEnd) {
    throw badRequest("Provide both startMinute and endMinute, or neither");
  }
  if (hasStart && hasEnd && (input.endMinute as number) <= (input.startMinute as number)) {
    throw badRequest("Block end must be after start");
  }

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: input.practitionerId,
      membership: { clinicId: ctx.clinicId },
    },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  if (
    ctx.role === "PRACTITIONER" &&
    ctx.practitionerProfileId !== practitioner.id
  ) {
    throw forbidden("Practitioners can only block their own diary");
  }

  const date = parseDateOnly(input.date);
  const startMinute = input.startMinute ?? null;
  const endMinute = input.endMinute ?? null;

  // Reject if an appointment overlaps the block window
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      practitionerId: practitioner.id,
      status: {
        notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      },
      startsAt: { lte: dayEnd },
      endsAt: { gte: dayStart },
    },
  });

  const clinic = await prisma.clinic.findFirst({
    where: { id: ctx.clinicId },
    select: { timezone: true },
  });
  const timeZone = clinic?.timezone ?? "Europe/London";

  for (const apt of appointments) {
    // Block minutes are clinic-local; compare appointments in the same zone.
    if (clinicDateKey(apt.startsAt, timeZone) !== input.date) continue;
    const aptStart = clinicMinutesFromMidnight(apt.startsAt, timeZone);
    const aptEnd = clinicMinutesFromMidnight(apt.endsAt, timeZone);
    const blockStart = startMinute ?? 0;
    const blockEnd = endMinute ?? 24 * 60;
    if (aptStart < blockEnd && aptEnd > blockStart) {
      throw conflict("Cannot block time that overlaps an existing appointment");
    }
  }

  const reason = input.reason?.trim() || null;
  if (isLeaveReason(reason)) {
    throw badRequest(
      "Use Team → Leave for annual/sick leave (needs approval). Diary blocks are for lunch, admin, and meetings only.",
    );
  }

  return prisma.availabilityException.create({
    data: {
      practitionerId: practitioner.id,
      date,
      isAvailable: false,
      startMinute,
      endMinute,
      reason,
      kind: "BLOCK",
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
  });
}

export async function deleteBlock(ctx: AuthContext, id: string) {
  const block = await prisma.availabilityException.findFirst({
    where: {
      id,
      practitioner: { membership: { clinicId: ctx.clinicId } },
    },
  });
  if (!block) throw notFound("Block not found");
  if (
    ctx.role === "PRACTITIONER" &&
    ctx.practitionerProfileId !== block.practitionerId
  ) {
    throw forbidden("Practitioners can only remove their own leave blocks");
  }
  await prisma.availabilityException.delete({ where: { id: block.id } });
  return { ok: true };
}

/** Load exceptions for a practitioner between from/to (inclusive dates). */
export async function loadExceptions(
  practitionerId: string,
  from: Date,
  to: Date,
) {
  return prisma.availabilityException.findMany({
    where: {
      practitionerId,
      date: { gte: startOfUtcDay(from), lte: startOfUtcDay(to) },
    },
  });
}

function startOfUtcDay(d: Date) {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
}

/**
 * Returns whether [startMinute, endMinute) on `day` is bookable given weekly
 * rules and exceptions. Minutes and day-of-week are clinic-local when
 * `timeZone` is set (required for production UK clinics on UTC hosts).
 */
export function isWindowAvailable(args: {
  day: Date;
  startMinute: number;
  endMinute: number;
  rules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  exceptions: {
    date: Date;
    isAvailable: boolean;
    startMinute: number | null;
    endMinute: number | null;
  }[];
  /** Clinic IANA timezone; defaults to Europe/London */
  timeZone?: string;
}) {
  const timeZone = args.timeZone ?? "Europe/London";
  const dow = clinicDayOfWeek(args.day, timeZone);
  const key = clinicDateKey(args.day, timeZone);
  const dayExceptions = args.exceptions.filter(
    (e) => utcDateKey(e.date) === key,
  );

  const blocked = dayExceptions.filter((e) => !e.isAvailable);
  for (const b of blocked) {
    const bStart = b.startMinute ?? 0;
    const bEnd = b.endMinute ?? 24 * 60;
    if (args.startMinute < bEnd && args.endMinute > bStart) {
      return false;
    }
  }

  const rules = args.rules.filter((r) => r.dayOfWeek === dow);
  if (rules.length === 0) return false;

  return rules.some(
    (r) => args.startMinute >= r.startMinute && args.endMinute <= r.endMinute,
  );
}

export async function assertWithinAvailability(args: {
  clinicId: string;
  practitionerId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const clinic = await prisma.clinic.findFirst({
    where: { id: args.clinicId },
    select: { timezone: true },
  });
  const timeZone = clinic?.timezone ?? "Europe/London";

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: args.practitionerId,
      active: true,
      membership: { clinicId: args.clinicId },
    },
    include: { availability: true },
  });
  if (!practitioner) throw notFound("Practitioner not found");

  // If no weekly hours configured, allow staff booking but still honour blocks
  const exceptions = await loadExceptions(
    practitioner.id,
    args.startsAt,
    args.endsAt,
  );

  const startMinute = clinicMinutesFromMidnight(args.startsAt, timeZone);
  const endMinute = clinicMinutesFromMidnight(args.endsAt, timeZone);

  const key = clinicDateKey(args.startsAt, timeZone);
  for (const b of exceptions.filter((e) => !e.isAvailable)) {
    if (utcDateKey(b.date) !== key) continue;
    const bStart = b.startMinute ?? 0;
    const bEnd = b.endMinute ?? 24 * 60;
    if (startMinute < bEnd && endMinute > bStart) {
      throw conflict(
        "Practitioner is unavailable (leave or blocked time)",
      );
    }
  }

  if (practitioner.availability.length > 0) {
    const ok = isWindowAvailable({
      day: args.startsAt,
      startMinute,
      endMinute,
      rules: practitioner.availability,
      exceptions,
      timeZone,
    });
    if (!ok) {
      throw conflict("Outside practitioner working hours");
    }
  }
}
