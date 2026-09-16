import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
} from "@/modules/scheduling/appointment-type-schema";
import type { z } from "zod";

export {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
} from "@/modules/scheduling/appointment-type-schema";

const COLOURS = [
  "#1E3F37",
  "#3D7A6E",
  "#5D7A5D",
  "#A3B18A",
  "#2F5D50",
  "#6B8F71",
] as const;

export async function listAppointmentTypesForClinic(
  ctx: AuthContext,
  opts: { activeOnly?: boolean } = {},
) {
  return prisma.appointmentType.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(opts.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createAppointmentType(
  ctx: AuthContext,
  input: z.infer<typeof createAppointmentTypeSchema>,
) {
  const name = input.name.trim();
  if (!name) throw badRequest("Name required");

  const existing = await prisma.appointmentType.findFirst({
    where: {
      clinicId: ctx.clinicId,
      name: { equals: name, mode: "insensitive" },
      active: true,
    },
  });
  if (existing) {
    throw badRequest("A service with this name already exists");
  }

  const colour =
    input.colour ??
    COLOURS[Math.floor(Math.random() * COLOURS.length)] ??
    "#3D7A6E";

  return prisma.appointmentType.create({
    data: {
      clinicId: ctx.clinicId,
      name,
      durationMinutes: input.durationMinutes,
      defaultPriceCents: input.defaultPriceCents,
      depositCents: input.depositCents ?? null,
      bufferBefore: input.bufferBefore ?? 0,
      bufferAfter: input.bufferAfter ?? 0,
      colour,
      onlineBookable: input.onlineBookable ?? true,
      active: true,
    },
  });
}

export async function updateAppointmentType(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updateAppointmentTypeSchema>,
) {
  const type = await prisma.appointmentType.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!type) throw notFound("Service not found");

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw badRequest("Name required");
    const clash = await prisma.appointmentType.findFirst({
      where: {
        clinicId: ctx.clinicId,
        id: { not: id },
        name: { equals: name, mode: "insensitive" },
        active: true,
      },
    });
    if (clash) throw badRequest("A service with this name already exists");
  }

  return prisma.appointmentType.update({
    where: { id: type.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes }
        : {}),
      ...(input.defaultPriceCents !== undefined
        ? { defaultPriceCents: input.defaultPriceCents }
        : {}),
      ...(input.depositCents !== undefined
        ? { depositCents: input.depositCents }
        : {}),
      ...(input.bufferBefore !== undefined
        ? { bufferBefore: input.bufferBefore }
        : {}),
      ...(input.bufferAfter !== undefined
        ? { bufferAfter: input.bufferAfter }
        : {}),
      ...(input.colour !== undefined ? { colour: input.colour } : {}),
      ...(input.onlineBookable !== undefined
        ? { onlineBookable: input.onlineBookable }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}
