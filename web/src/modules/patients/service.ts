import { z } from "zod";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import type { AuthContext } from "@/server/auth";

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  alerts: z.string().max(2000).optional().nullable(),
});

export const updatePatientSchema = createPatientSchema.partial();

export async function listPatients(
  ctx: AuthContext,
  opts: { q?: string; take?: number } = {},
) {
  const take = Math.min(opts.take ?? 50, 100);
  const q = opts.q?.trim();

  return prisma.patient.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take,
  });
}

export async function getPatient(ctx: AuthContext, id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      consents: { orderBy: { capturedAt: "desc" }, take: 20 },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 20,
        include: { appointmentType: true, practitioner: true },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          source: true,
          signedAt: true,
          createdAt: true,
          templateId: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!patient) throw notFound("Patient not found");
  return patient;
}

export async function createPatient(
  ctx: AuthContext,
  input: z.infer<typeof createPatientSchema>,
) {
  return prisma.patient.create({
    data: {
      clinicId: ctx.clinicId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      alerts: input.alerts ?? null,
    },
  });
}

export async function updatePatient(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updatePatientSchema>,
) {
  await assertPatientInClinic(ctx.clinicId, id);
  return prisma.patient.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.alerts !== undefined ? { alerts: input.alerts } : {}),
      ...(input.dateOfBirth !== undefined
        ? {
            dateOfBirth: input.dateOfBirth
              ? new Date(input.dateOfBirth)
              : null,
          }
        : {}),
    },
  });
}

export const consentSchema = z.object({
  type: z.enum(["RECORDING", "MARKETING", "PRIVACY_POLICY"]),
  granted: z.boolean(),
  method: z.enum(["in_person", "online_form", "verbal"]),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function addConsent(
  ctx: AuthContext,
  patientId: string,
  input: z.infer<typeof consentSchema>,
) {
  await assertPatientInClinic(ctx.clinicId, patientId);
  return prisma.patientConsent.create({
    data: {
      patientId,
      type: input.type,
      granted: input.granted,
      method: input.method,
      meta: input.meta as object | undefined,
    },
  });
}

async function assertPatientInClinic(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  });
  if (!patient) throw notFound("Patient not found");
}

export async function requirePatient(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
  });
  if (!patient) throw notFound("Patient not found");
  return patient;
}

export function parseListQuery(url: URL) {
  const q = url.searchParams.get("q") ?? undefined;
  const takeRaw = url.searchParams.get("take");
  const take = takeRaw ? Number(takeRaw) : undefined;
  if (take !== undefined && (!Number.isFinite(take) || take < 1)) {
    throw badRequest("Invalid take");
  }
  return { q, take };
}
