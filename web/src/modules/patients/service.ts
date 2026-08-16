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
        take: 25,
        include: {
          appointmentType: { select: { id: true, name: true, durationMinutes: true } },
          practitioner: { select: { id: true, displayName: true } },
          visit: { select: { id: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          template: { select: { id: true, name: true } },
          visit: {
            select: {
              id: true,
              appointment: {
                select: {
                  startsAt: true,
                  appointmentType: { select: { name: true } },
                  practitioner: { select: { displayName: true } },
                },
              },
            },
          },
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

/** Compact prep payload for diary / visit — history + readable prior notes */
export async function getPatientPrep(
  ctx: AuthContext,
  id: string,
  opts: { source?: string } = {},
) {
  const patient = await getPatient(ctx, id);
  const notes = patient.notes.map((n) => ({
    id: n.id,
    status: n.status,
    source: n.source,
    signedAt: n.signedAt,
    createdAt: n.createdAt,
    templateName: n.template?.name ?? null,
    visitId: n.visitId,
    appointmentStartsAt: n.visit?.appointment?.startsAt ?? null,
    serviceName: n.visit?.appointment?.appointmentType?.name ?? null,
    practitionerName: n.visit?.appointment?.practitioner?.displayName ?? null,
    summary: summariseNoteContent(n.content),
    sections: flattenNoteSections(n.content),
  }));

  await prisma.patientAccessEvent.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: patient.id,
      actorId: ctx.userId,
      action: "prep_opened",
      meta: {
        source: opts.source ?? "unknown",
        appointmentCount: patient.appointments.length,
        noteCount: notes.length,
        noteIds: notes.map((n) => n.id),
      },
    },
  });

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    email: patient.email,
    phone: patient.phone,
    dateOfBirth: patient.dateOfBirth,
    alerts: patient.alerts,
    appointments: patient.appointments.map((a) => ({
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      notes: a.notes,
      serviceName: a.appointmentType.name,
      practitionerName: a.practitioner.displayName,
      visitId: a.visit?.id ?? null,
    })),
    notes,
  };
}

export async function recordNoteHistoryExpand(
  ctx: AuthContext,
  patientId: string,
  noteId: string,
  opts: { source?: string } = {},
) {
  await assertPatientInClinic(ctx.clinicId, patientId);

  const note = await prisma.clinicalNote.findFirst({
    where: { id: noteId, patientId, patient: { clinicId: ctx.clinicId } },
    select: { id: true },
  });
  if (!note) throw notFound("Note not found");

  await prisma.$transaction([
    prisma.patientAccessEvent.create({
      data: {
        clinicId: ctx.clinicId,
        patientId,
        actorId: ctx.userId,
        action: "note_expanded",
        meta: {
          noteId,
          source: opts.source ?? "patient_prep",
        },
      },
    }),
    prisma.noteAuditEvent.create({
      data: {
        noteId,
        actorId: ctx.userId,
        action: "viewed",
        meta: {
          source: opts.source ?? "patient_prep_expand",
        },
      },
    }),
  ]);

  return { ok: true };
}

function asRecord(content: unknown): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return {};
}

function flattenNoteSections(content: unknown): { key: string; value: string }[] {
  const raw = asRecord(content);
  const sections =
    raw.sections && typeof raw.sections === "object" && !Array.isArray(raw.sections)
      ? (raw.sections as Record<string, unknown>)
      : raw;
  const out: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(sections)) {
    if (key === "flags" || key === "sections") continue;
    if (typeof val === "string" && val.trim()) {
      out.push({ key, value: val.trim() });
    } else if (val && typeof val === "object" && "text" in (val as object)) {
      const text = String((val as { text?: unknown }).text ?? "").trim();
      if (text) out.push({ key, value: text });
    }
  }
  return out;
}

function summariseNoteContent(content: unknown): string {
  const sections = flattenNoteSections(content);
  if (sections.length === 0) return "";
  const prefer = ["plan", "assessment", "subjective", "objective", "hpc", "presenting"];
  const ranked = [...sections].sort((a, b) => {
    const ai = prefer.findIndex((p) => a.key.toLowerCase().includes(p));
    const bi = prefer.findIndex((p) => b.key.toLowerCase().includes(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const first = ranked[0];
  const text = first.value.replace(/\s+/g, " ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
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
