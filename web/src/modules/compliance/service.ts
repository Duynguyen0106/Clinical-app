import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth";

export async function exportNoteAudits(
  ctx: AuthContext,
  opts: { from?: Date; to?: Date; patientId?: string } = {},
) {
  // Clinical access telemetry — not for reception
  requireRole(ctx, ["OWNER", "PRACTITIONER"]);

  const createdFilter =
    opts.from || opts.to
      ? {
          createdAt: {
            ...(opts.from ? { gte: opts.from } : {}),
            ...(opts.to ? { lte: opts.to } : {}),
          },
        }
      : {};

  // Practitioners: own diary only; OWNER sees clinic-wide
  const diaryId =
    ctx.role === "PRACTITIONER" ? ctx.practitionerProfileId : null;
  const ownDiaryNote = diaryId
    ? {
        OR: [
          { visit: { appointment: { practitionerId: diaryId } } },
          { signedById: ctx.userId },
        ],
      }
    : {};

  const [noteEvents, accessEvents, scheduleEvents] = await Promise.all([
    prisma.noteAuditEvent.findMany({
      where: {
        note: {
          patient: {
            clinicId: ctx.clinicId,
            ...(opts.patientId ? { id: opts.patientId } : {}),
          },
          ...ownDiaryNote,
        },
        ...createdFilter,
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
        // Practitioners only see access events they performed
        ...(diaryId ? { actorId: ctx.userId } : {}),
        ...createdFilter,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.appointmentAuditEvent.findMany({
      where: {
        clinicId: ctx.clinicId,
        ...(opts.patientId || diaryId
          ? {
              appointment: {
                ...(opts.patientId ? { patientId: opts.patientId } : {}),
                ...(diaryId ? { practitionerId: diaryId } : {}),
              },
            }
          : {}),
        ...createdFilter,
      },
      include: {
        appointment: {
          select: {
            id: true,
            startsAt: true,
            status: true,
            patientId: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);

  const actorIds = [
    ...new Set(
      [...noteEvents, ...accessEvents, ...scheduleEvents]
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

  const schedule = scheduleEvents.map((e) => ({
    kind: "schedule" as const,
    eventId: e.id,
    action: e.action,
    at: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorEmail: e.actorId ? (actorMap.get(e.actorId)?.email ?? null) : null,
    actorName: e.actorId ? (actorMap.get(e.actorId)?.name ?? null) : null,
    noteId: null as string | null,
    noteStatus: null as string | null,
    patientId: e.appointment.patientId,
    patientName: `${e.appointment.patient.firstName} ${e.appointment.patient.lastName}`,
    signedAt: null as string | null,
    meta: {
      ...(typeof e.meta === "object" && e.meta && !Array.isArray(e.meta)
        ? e.meta
        : {}),
      appointmentId: e.appointmentId,
      appointmentStartsAt: e.appointment.startsAt.toISOString(),
      appointmentStatus: e.appointment.status,
    },
  }));

  return [...notes, ...access, ...schedule].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

/**
 * Owner-only full patient database export (JSON) for backup / portability.
 * Includes demographics, consents, appointments, note metadata (not bodies),
 * and invoices. Clinical note bodies are omitted — use note print/export flows
 * for individual clinical records.
 */
export async function exportPatientsDatabase(ctx: AuthContext) {
  requireRole(ctx, ["OWNER"]);

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { id: true, name: true, slug: true },
  });

  const patients = await prisma.patient.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      alerts: true,
      gpName: true,
      gpPractice: true,
      gpEmail: true,
      nhsNumber: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      consents: {
        orderBy: { capturedAt: "desc" },
        select: {
          id: true,
          type: true,
          granted: true,
          method: true,
          capturedAt: true,
        },
      },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 200,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          notes: true,
          depositCents: true,
          depositStatus: true,
          appointmentType: { select: { name: true, durationMinutes: true } },
          practitioner: { select: { displayName: true } },
          location: { select: { name: true } },
          room: { select: { name: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          status: true,
          source: true,
          signedAt: true,
          createdAt: true,
          updatedAt: true,
          template: { select: { name: true } },
          visitId: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          amountCents: true,
          currency: true,
          status: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
          appointmentId: true,
          payments: {
            select: {
              id: true,
              amountCents: true,
              method: true,
              paidAt: true,
            },
          },
        },
      },
      waitlistEntries: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          preferredFrom: true,
          preferredTo: true,
          notes: true,
          createdAt: true,
          appointmentType: { select: { name: true } },
        },
      },
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    clinic,
    patientCount: patients.length,
    patients,
  };
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
