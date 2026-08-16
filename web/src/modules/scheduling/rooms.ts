import { z } from "zod";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  locationId: z.string().optional().nullable(),
  colour: z.string().max(20).optional(),
});

export const updateRoomSchema = createRoomSchema.partial().extend({
  active: z.boolean().optional(),
});

export async function listRooms(ctx: AuthContext, opts: { activeOnly?: boolean } = {}) {
  return prisma.room.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(opts.activeOnly ? { active: true } : {}),
    },
    include: { location: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createRoom(
  ctx: AuthContext,
  input: z.infer<typeof createRoomSchema>,
) {
  if (input.locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: input.locationId, clinicId: ctx.clinicId },
    });
    if (!loc) throw notFound("Location not found");
  }
  return prisma.room.create({
    data: {
      clinicId: ctx.clinicId,
      name: input.name.trim(),
      locationId: input.locationId ?? null,
      colour: input.colour ?? "#5D7A5D",
    },
    include: { location: { select: { id: true, name: true } } },
  });
}

export async function updateRoom(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updateRoomSchema>,
) {
  const room = await prisma.room.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!room) throw notFound("Room not found");
  if (input.name !== undefined && !input.name.trim()) {
    throw badRequest("Name required");
  }
  return prisma.room.update({
    where: { id: room.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.colour !== undefined ? { colour: input.colour } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: { location: { select: { id: true, name: true } } },
  });
}

/** First free active room for a slot, or null. */
export async function findAvailableRoom(opts: {
  clinicId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string;
}) {
  const rooms = await prisma.room.findMany({
    where: { clinicId: opts.clinicId, active: true },
    orderBy: { name: "asc" },
  });
  for (const room of rooms) {
    const clash = await prisma.appointment.findFirst({
      where: {
        clinicId: opts.clinicId,
        roomId: room.id,
        id: opts.excludeAppointmentId
          ? { not: opts.excludeAppointmentId }
          : undefined,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startsAt: { lt: opts.endsAt },
        endsAt: { gt: opts.startsAt },
      },
      select: { id: true },
    });
    if (!clash) return room;
  }
  return null;
}
