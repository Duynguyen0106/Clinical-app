import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth";

export async function exportNoteAudits(
  ctx: AuthContext,
  opts: { from?: Date; to?: Date; patientId?: string } = {},
) {
  requireRole(ctx, ["OWNER", "PRACTITIONER", "RECEPTION"]);

  const [noteEvents, accessEvents] = await Promise.all([
    prisma.noteAuditEvent.findMany({
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
    }),
    prisma.patientAccessEvent.findMany({
      where: {
        clinicId: ctx.clinicId,
        ...(opts.patientId ? { patientId: opts.patientId } : {}),
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
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);

  const actorIds = [
    ...new Set(
      [...noteEvents, ...accessEvents]
        .map((e) => e.actorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const notes = noteEvents.map((e) => ({
    kind: "note" as const,
    eventId: e.id,
    action: e.action,
    at: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorEmail: e.actorId ? (actorMap.get(e.actorId)?.email ?? null) : null,
    actorName: e.actorId ? (actorMap.get(e.actorId)?.name ?? null) : null,
    noteId: e.noteId,
    noteStatus: e.note.status,
    patientId: e.note.patientId,
    patientName: `${e.note.patient.firstName} ${e.note.patient.lastName}`,
    signedAt: e.note.signedAt?.toISOString() ?? null,
    meta: e.meta,
  }));

  const access = accessEvents.map((e) => ({
    kind: "patient_access" as const,
    eventId: e.id,
    action: e.action,
    at: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorEmail: e.actorId ? (actorMap.get(e.actorId)?.email ?? null) : null,
    actorName: e.actorId ? (actorMap.get(e.actorId)?.name ?? null) : null,
    noteId: null as string | null,
    noteStatus: null as string | null,
    patientId: e.patientId,
    patientName: `${e.patient.firstName} ${e.patient.lastName}`,
    signedAt: null as string | null,
    meta: e.meta,
  }));

  return [...notes, ...access].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

export async function getClinicCompliance(ctx: AuthContext) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      phone: true,
      email: true,
      address: true,
      audioRetentionDays: true,
      privacyNoticeVersion: true,
      dataRegion: true,
    },
  });
  return clinic;
}

export async function updateClinicCompliance(
  ctx: AuthContext,
  input: {
    audioRetentionDays?: number;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  },
) {
  requireRole(ctx, ["OWNER"]);
  return prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      ...(input.audioRetentionDays !== undefined
        ? { audioRetentionDays: Math.max(0, Math.min(365, input.audioRetentionDays)) }
        : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone?.trim() || null }
        : {}),
      ...(input.email !== undefined
        ? { email: input.email?.trim() || null }
        : {}),
      ...(input.address !== undefined
        ? { address: input.address?.trim() || null }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      audioRetentionDays: true,
      privacyNoticeVersion: true,
      dataRegion: true,
    },
  });
}
