import { z } from "zod";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, notFound } from "@/server/errors";

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

/** Local calendar date key for in-process Date objects (slot loops). */
function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** UTC date key for Prisma `@db.Date` values. */
function utcDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function listBlocks(
  ctx: AuthContext,
  opts: { from?: string; to?: string; practitionerId?: string } = {},
) {
  const from = opts.from ? parseDateOnly(opts.from.slice(0, 10)) : undefined;
  const to = opts.to ? parseDateOnly(opts.to.slice(0, 10)) : undefined;

  return prisma.availabilityException.findMany({
    where: {
      practitioner: {
        membership: { clinicId: ctx.clinicId },
        ...(opts.practitionerId ? { id: opts.practitionerId } : {}),
      },
      isAvailable: false,
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

  for (const apt of appointments) {
    // Compare in UTC minutes — block dates are stored as UTC @db.Date and the
    // diary slot engine runs in server-local time (UTC in production containers).
    const aptStart =
      apt.startsAt.getUTCHours() * 60 + apt.startsAt.getUTCMinutes();
    const aptEnd =
      apt.endsAt.getUTCHours() * 60 + apt.endsAt.getUTCMinutes();
    const blockStart = startMinute ?? 0;
    const blockEnd = endMinute ?? 24 * 60;
    if (aptStart < blockEnd && aptEnd > blockStart) {
      throw conflict("Cannot block time that overlaps an existing appointment");
    }
  }

  return prisma.availabilityException.create({
    data: {
      practitionerId: practitioner.id,
      date,
      isAvailable: false,
      startMinute,
      endMinute,
      reason: input.reason?.trim() || null,
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
 * rules and exceptions. Exceptions with isAvailable=false carve out time.
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
}) {
  const dow = args.day.getDay();
  const key = localDateKey(args.day);
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

  const startMinute =
    args.startsAt.getUTCHours() * 60 + args.startsAt.getUTCMinutes();
  const endMinute =
    args.endsAt.getUTCHours() * 60 + args.endsAt.getUTCMinutes();

  const key = localDateKey(args.startsAt);
  for (const b of exceptions.filter((e) => !e.isAvailable)) {
    if (utcDateKey(b.date) !== key) continue;
    const bStart = b.startMinute ?? 0;
    const bEnd = b.endMinute ?? 24 * 60;
    if (startMinute < bEnd && endMinute > bStart) {
      throw conflict("This time is blocked on the practitioner diary");
    }
  }

  if (practitioner.availability.length > 0) {
    const ok = isWindowAvailable({
      day: args.startsAt,
      startMinute,
      endMinute,
      rules: practitioner.availability,
      exceptions,
    });
    if (!ok) {
      throw conflict("Outside practitioner working hours");
    }
  }
}
