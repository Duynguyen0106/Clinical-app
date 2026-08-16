import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth";

export async function exportNoteAudits(
  ctx: AuthContext,
  opts: { from?: Date; to?: Date; patientId?: string } = {},
) {
  requireRole(ctx, ["OWNER", "PRACTITIONER", "RECEPTION"]);

  const events = await prisma.noteAuditEvent.findMany({
    where: {
      note: {
        patient: {
          clinicId: ctx.clinicId,
          ...(opts.patientId ? { id: opts.patientId } : {}),
        },
      },
      ...(opts.from || opts.to
        ? {
            createdAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    },
    include: {
      note: {
        select: {
          id: true,
          status: true,
          signedAt: true,
          patientId: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  return events.map((e) => ({
    eventId: e.id,
    action: e.action,
    at: e.createdAt.toISOString(),
    actorId: e.actorId,
    noteId: e.noteId,
    noteStatus: e.note.status,
    patientId: e.note.patientId,
    patientName: `${e.note.patient.firstName} ${e.note.patient.lastName}`,
    signedAt: e.note.signedAt?.toISOString() ?? null,
    meta: e.meta,
  }));
}

export async function getClinicCompliance(ctx: AuthContext) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      audioRetentionDays: true,
      privacyNoticeVersion: true,
      dataRegion: true,
    },
  });
  return clinic;
}

export async function updateClinicCompliance(
  ctx: AuthContext,
  input: { audioRetentionDays?: number },
) {
  requireRole(ctx, ["OWNER"]);
  return prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      ...(input.audioRetentionDays !== undefined
        ? { audioRetentionDays: Math.max(0, Math.min(365, input.audioRetentionDays)) }
        : {}),
    },
    select: {
      id: true,
      audioRetentionDays: true,
      privacyNoticeVersion: true,
      dataRegion: true,
    },
  });
}
