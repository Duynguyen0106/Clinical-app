import { z } from "zod";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";

const COLOURS = [
  "#1E3F37",
  "#3D7A6E",
  "#5D7A5D",
  "#A3B18A",
  "#2F5D50",
  "#6B8F71",
] as const;

export const createAppointmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  /** List price in GBP pence (max £10,000) */
  defaultPriceCents: z.number().int().min(0).max(1_000_000),
  depositCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  colour: z.string().max(20).optional(),
  onlineBookable: z.boolean().optional(),
});

export const updateAppointmentTypeSchema = createAppointmentTypeSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
  });

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
