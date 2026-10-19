import { z } from "zod";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import type { AuthContext } from "@/server/auth";
import {
  assertCanAccessClinicalRecord,
  canAccessClinicalRecord,
} from "@/server/rbac";
import {
  buildPatientTimeline,
  type TimelineItem,
} from "@/modules/patients/timeline";
import { assertNoteDiaryAccess } from "@/modules/notes/access";
import {
  clinicDateKey,
  clinicLocalDateTime,
} from "@/modules/scheduling/clinic-time";
import { withClinicTransaction } from "@/server/clinic-rls";

export type { TimelineItem };
export { buildPatientTimeline } from "@/modules/patients/timeline";

/** Treat blank strings as null so empty form fields validate. */
const optionalEmail = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().email().nullable(),
);

const optionalDob = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ])
    .nullable(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().max(max).nullable(),
  );

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: optionalEmail.optional(),
  phone: optionalText(40).optional(),
  dateOfBirth: optionalDob.optional(),
  alerts: optionalText(2000).optional(),
  gpName: optionalText(120).optional(),
  gpPractice: optionalText(200).optional(),
  gpEmail: optionalEmail.optional(),
  nhsNumber: optionalText(20).optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

function patientSearchWhere(q: string | undefined) {
  const trimmed = q?.trim();
  if (!trimmed) return {};
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return {
      AND: tokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: "insensitive" as const } },
          { lastName: { contains: token, mode: "insensitive" as const } },
          { email: { contains: token, mode: "insensitive" as const } },
          { phone: { contains: token } },
          { nhsNumber: { contains: token } },
        ],
      })),
    };
  }
  return {
    OR: [
      { firstName: { contains: trimmed, mode: "insensitive" as const } },
      { lastName: { contains: trimmed, mode: "insensitive" as const } },
      { email: { contains: trimmed, mode: "insensitive" as const } },
      { phone: { contains: trimmed } },
      { nhsNumber: { contains: trimmed } },
    ],
  };
}

/** Clinic-TZ calendar day bounds for YYYY-MM-DD. */
export function dayBoundsFromYmd(
  ymd: string,
  timeZone: string,
): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw badRequest("Invalid appointmentOn date");
  }
  const from = clinicLocalDateTime(ymd, 0, timeZone);
  const to = new Date(
    clinicLocalDateTime(ymd, 23 * 60 + 59, timeZone).getTime() + 999,
  );
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("Invalid appointmentOn date");
  }
  return { from, to };
}

export function todayYmd(timeZone: string, d = new Date()) {
  return clinicDateKey(d, timeZone);
}

export async function listPatients(
  ctx: AuthContext,
  opts: {
    q?: string;
    take?: number;
    appointmentOn?: string;
    practitionerId?: string;
  } = {},
) {
  const take = Math.min(opts.take ?? 50, 100);
  const q = opts.q?.trim();
  const search = patientSearchWhere(q);

  // Day-scoped list: patients with a non-cancelled appointment that day
  if (opts.appointmentOn) {
    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: ctx.clinicId },
      select: { timezone: true },
    });
    const { from, to } = dayBoundsFromYmd(
      opts.appointmentOn,
      clinic.timezone,
    );
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: ctx.clinicId,
        startsAt: { gte: from, lte: to },
        status: { not: "CANCELLED" },
        ...(opts.practitionerId
          ? { practitionerId: opts.practitionerId }
          : {}),
        patient: {
          clinicId: ctx.clinicId,
          archivedAt: null,
          ...search,
        },
      },
      include: {
        patient: true,
        appointmentType: { select: { id: true, name: true, durationMinutes: true } },
        visit: { select: { id: true } },
      },
      orderBy: { startsAt: "asc" },
      take: Math.min(take * 4, 200),
    });

    const byPatient = new Map<
      string,
      (typeof appointments)[number]["patient"] & {
        todayAppointments: Array<{
          id: string;
          startsAt: Date;
          endsAt: Date;
          status: string;
          appointmentType: { id: string; name: string; durationMinutes: number };
          visit: { id: string } | null;
        }>;
      }
    >();

    for (const apt of appointments) {
      const existing = byPatient.get(apt.patientId);
      const slot = {
        id: apt.id,
        startsAt: apt.startsAt,
        endsAt: apt.endsAt,
        status: apt.status,
        appointmentType: apt.appointmentType,
        visit: apt.visit,
      };
      if (existing) {
        existing.todayAppointments.push(slot);
      } else if (byPatient.size < take) {
        byPatient.set(apt.patientId, {
          ...apt.patient,
          todayAppointments: [slot],
        });
      }
    }

    return Array.from(byPatient.values());
  }

  // Practitioner diary search (no day filter): anyone this practitioner has seen
  if (opts.practitionerId) {
    return prisma.patient.findMany({
      where: {
        clinicId: ctx.clinicId,
        archivedAt: null,
        ...search,
        appointments: {
          some: {
            clinicId: ctx.clinicId,
            practitionerId: opts.practitionerId,
            status: { not: "CANCELLED" },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take,
    });
  }

  return prisma.patient.findMany({
    where: {
      clinicId: ctx.clinicId,
      archivedAt: null,
      ...search,
      ...(opts.practitionerId
        ? {
            appointments: {
              some: {
                practitionerId: opts.practitionerId,
                status: { not: "CANCELLED" },
              },
            },
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take,
  });
}

const noteMetaSelect = {
  id: true,
  status: true,
  source: true,
  signedAt: true,
  createdAt: true,
  visitId: true,
  template: { select: { id: true, name: true } },
  visit: {
    select: {
      id: true,
      appointment: {
        select: {
          startsAt: true,
          appointmentType: { select: { name: true } },
          practitioner: { select: { id: true, displayName: true } },
        },
      },
    },
  },
} as const;

export async function getPatient(ctx: AuthContext, id: string) {
  const canViewNotes = canAccessClinicalRecord(ctx.role);
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
      // Metadata only — clinical bodies stay off the patient profile payload
      notes: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: noteMetaSelect,
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!patient) throw notFound("Patient not found");
  // Reception must not receive note rows (need-to-know)
  if (!canViewNotes) {
    return { ...patient, notes: [], invoices: patient.invoices };
  }
  // Practitioners: own-diary relationship required; no clinic-wide invoices
  if (ctx.role === "PRACTITIONER") {
    await assertPractitionerDiaryPatient(ctx, id);
    const diaryId = ctx.practitionerProfileId!;
    const notes = patient.notes
      .filter(
        (n) => n.visit?.appointment?.practitioner?.id === diaryId,
      )
      .slice(0, 15);
    const appointments = patient.appointments.filter(
      (a) => a.practitioner.id === diaryId,
    );
    return { ...patient, notes, appointments, invoices: [] };
  }
  return { ...patient, notes: patient.notes.slice(0, 15) };
}

/**
 * Prep pack for diary / visit.
 * Staff always get booking history + alerts.
 * Clinical note bodies are never included here — clinicians load them via
 * expand (`recordNoteHistoryExpand`), which audits the disclosure.
 */
export async function getPatientPrep(
  ctx: AuthContext,
  id: string,
  opts: { source?: string } = {},
) {
  const canViewNotes = canAccessClinicalRecord(ctx.role);
  const diaryId =
    ctx.role === "PRACTITIONER" ? ctx.practitionerProfileId : null;
  if (ctx.role === "PRACTITIONER") {
    await assertPractitionerDiaryPatient(ctx, id);
  }

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      alerts: true,
      appointments: {
        where: diaryId ? { practitionerId: diaryId } : undefined,
        orderBy: { startsAt: "desc" },
        take: 25,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          notes: true,
          appointmentType: { select: { name: true } },
          practitioner: { select: { displayName: true } },
          visit: { select: { id: true } },
        },
      },
      notes: {
        where: diaryId
          ? {
              OR: [
                { visit: { appointment: { practitionerId: diaryId } } },
                { signedById: ctx.userId },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" as const },
        take: canViewNotes ? 15 : 0,
        select: {
          id: true,
          status: true,
          source: true,
          signedAt: true,
          createdAt: true,
          visitId: true,
          template: { select: { name: true } },
          visit: {
            select: {
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
        orderBy: { createdAt: "desc" as const },
        take: ctx.role === "OWNER" || ctx.role === "RECEPTION" ? 20 : 0,
        select: {
          id: true,
          amountCents: true,
          currency: true,
          status: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
          appointmentId: true,
        },
      },
    },
  });
  if (!patient) throw notFound("Patient not found");

  const notesRaw = canViewNotes ? patient.notes : [];
  const invoices =
    ctx.role === "OWNER" || ctx.role === "RECEPTION" ? patient.invoices : [];
  const notes = notesRaw.map((n) => ({
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
    summary: "",
    sections: [] as { key: string; value: string }[],
  }));

  const timeline = buildPatientTimeline({
    appointments: patient.appointments,
    notes: notesRaw,
    invoices,
    includeNotes: canViewNotes,
  });

  const payload = {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    email: patient.email,
    phone: patient.phone,
    dateOfBirth: patient.dateOfBirth,
    alerts: patient.alerts,
    canViewClinicalNotes: canViewNotes,
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
    invoices,
    timeline,
  };

  // Audit after payload is ready; do not block the response on a slow write.
  void prisma.patientAccessEvent
    .create({
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
          clinicalNotesIncluded: canViewNotes,
          role: ctx.role,
          invoiceCount: invoices.length,
        },
      },
    })
    .catch(() => undefined);

  return payload;
}

/**
 * Clinician expands a prior note in prep — returns body and audits the read.
 * Reception is denied (need-to-know).
 */
export async function recordNoteHistoryExpand(
  ctx: AuthContext,
  patientId: string,
  noteId: string,
  opts: { source?: string } = {},
) {
  assertCanAccessClinicalRecord(ctx);
  await assertPatientInClinic(ctx.clinicId, patientId);
  await assertNoteDiaryAccess(ctx, noteId);

  const note = await prisma.clinicalNote.findFirst({
    where: { id: noteId, patientId, patient: { clinicId: ctx.clinicId } },
    select: { id: true, content: true, status: true },
  });
  if (!note) throw notFound("Note not found");

  await withClinicTransaction(ctx.clinicId, async (tx) => {
    await tx.patientAccessEvent.create({
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
    });
    await tx.noteAuditEvent.create({
      data: {
        noteId,
        actorId: ctx.userId,
        action: "viewed",
        meta: {
          source: opts.source ?? "patient_prep_expand",
        },
      },
    });
  });

  return {
    ok: true as const,
    noteId: note.id,
    status: note.status,
    summary: summariseNoteContent(note.content),
    sections: flattenNoteSections(note.content),
  };
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
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.patient.create({
      data: {
        clinicId: ctx.clinicId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        dateOfBirth: parseDob(input.dateOfBirth),
        alerts: input.alerts ?? null,
        gpName: input.gpName ?? null,
        gpPractice: input.gpPractice ?? null,
        gpEmail: input.gpEmail ?? null,
        nhsNumber: input.nhsNumber ?? null,
      },
    });
  });
}

function parseDob(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

export async function updatePatient(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updatePatientSchema>,
) {
  await assertPatientInClinic(ctx.clinicId, id);
  await assertPractitionerDiaryPatient(ctx, id);
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.patient.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.alerts !== undefined ? { alerts: input.alerts } : {}),
        ...(input.gpName !== undefined ? { gpName: input.gpName } : {}),
        ...(input.gpPractice !== undefined
          ? { gpPractice: input.gpPractice }
          : {}),
        ...(input.gpEmail !== undefined ? { gpEmail: input.gpEmail } : {}),
        ...(input.nhsNumber !== undefined ? { nhsNumber: input.nhsNumber } : {}),
        ...(input.dateOfBirth !== undefined
          ? { dateOfBirth: parseDob(input.dateOfBirth) }
          : {}),
      },
    });
  });
}

/**
 * Permanently delete a patient. Blocked when they have signed clinical notes
 * or upcoming appointments unless `force` is true (owner cleanup / test data).
 */
export async function deletePatient(
  ctx: AuthContext,
  id: string,
  opts: { force?: boolean } = {},
) {
  await assertPatientInClinic(ctx.clinicId, id);

  const [signedNotes, upcoming] = await Promise.all([
    prisma.clinicalNote.count({
      where: { patientId: id, status: "SIGNED" },
    }),
    prisma.appointment.count({
      where: {
        patientId: id,
        clinicId: ctx.clinicId,
        startsAt: { gte: new Date() },
        status: { not: "CANCELLED" },
      },
    }),
  ]);

  if ((signedNotes > 0 || upcoming > 0) && !opts.force) {
    throw badRequest(
      `Cannot archive: ${signedNotes} signed note(s) and ${upcoming} upcoming appointment(s). Remove or cancel those first, or ask an owner to force-archive.`,
    );
  }

  // Soft-delete — keep clinical history; hide from directory and booking match.
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.patient.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        // Clear email so a future online book can create a fresh record safely
        email: null,
      },
    });
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
  await assertPractitionerDiaryPatient(ctx, patientId);
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.patientConsent.create({
      data: {
        patientId,
        type: input.type,
        granted: input.granted,
        method: input.method,
        meta: input.meta as object | undefined,
      },
    });
  });
}

async function assertPatientInClinic(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  });
  if (!patient) throw notFound("Patient not found");
}

/** Practitioners may only touch patients who appear on their diary. */
async function assertPractitionerDiaryPatient(
  ctx: AuthContext,
  patientId: string,
) {
  if (ctx.role !== "PRACTITIONER") return;
  if (!ctx.practitionerProfileId) throw notFound("Patient not found");
  const apt = await prisma.appointment.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      practitionerId: ctx.practitionerProfileId,
    },
    select: { id: true },
  });
  if (!apt) throw notFound("Patient not found");
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
  const appointmentOnRaw = url.searchParams.get("appointmentOn") ?? undefined;
  const appointmentOn = appointmentOnRaw?.trim() || undefined;
  if (appointmentOn && !/^\d{4}-\d{2}-\d{2}$/.test(appointmentOn)) {
    throw badRequest("appointmentOn must be YYYY-MM-DD");
  }
  const practitionerId =
    url.searchParams.get("practitionerId")?.trim() || undefined;
  return { q, take, appointmentOn, practitionerId };
}
