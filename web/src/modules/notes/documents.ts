import { NoteStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { assertCanAccessClinicalRecord } from "@/server/rbac";

export type DocumentSection = { key: string; label: string; value: string };

export type ClinicalDocument = {
  kind: "clinical_note";
  noteId: string;
  status: string;
  signedAt: string | null;
  clinic: { name: string; timezone: string };
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
  };
  practitioner: { displayName: string } | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  templateName: string | null;
  sections: DocumentSection[];
  printedAt: string;
};

export type GpLetterDocument = {
  kind: "gp_letter";
  noteId: string;
  clinic: { name: string; timezone: string };
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: string | null;
  };
  practitioner: { displayName: string } | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  gp: {
    name: string | null;
    practice: string | null;
    email: string | null;
  };
  subject: string;
  body: string;
  signedAt: string | null;
  printedAt: string;
};

function titleCase(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function asRecord(content: unknown): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return {};
}

export function flattenNoteSections(content: unknown): DocumentSection[] {
  const raw = asRecord(content);
  const nested =
    raw.sections && typeof raw.sections === "object" && !Array.isArray(raw.sections)
      ? (raw.sections as Record<string, unknown>)
      : raw;
  const out: DocumentSection[] = [];
  for (const [key, val] of Object.entries(nested)) {
    if (key === "flags" || key === "sections" || key === "clinician_review_flags") {
      continue;
    }
    let text = "";
    if (typeof val === "string") text = val.trim();
    else if (val && typeof val === "object" && "text" in (val as object)) {
      text = String((val as { text?: unknown }).text ?? "").trim();
    }
    if (text) out.push({ key, label: titleCase(key), value: text });
  }
  return out;
}

function sectionText(sections: DocumentSection[], matchers: string[]) {
  const found = sections.find((s) =>
    matchers.some((m) => s.key.toLowerCase().includes(m)),
  );
  return found?.value?.trim() ?? "";
}

function composeLetterBody(args: {
  practitionerName: string;
  clinicName: string;
  patientName: string;
  serviceName: string | null;
  appointmentStartsAt: Date | null;
  sections: DocumentSection[];
}) {
  const when = args.appointmentStartsAt
    ? args.appointmentStartsAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const subjective = sectionText(args.sections, [
    "subjective",
    "hpc",
    "presenting",
    "history",
  ]);
  const objective = sectionText(args.sections, [
    "objective",
    "examination",
    "findings",
  ]);
  const assessment = sectionText(args.sections, [
    "assessment",
    "impression",
    "diagnosis",
  ]);
  const plan = sectionText(args.sections, ["plan", "advice", "treatment"]);

  const paragraphs: string[] = [
    `Dear Colleague,`,
    `I am writing regarding ${args.patientName}, who attended ${args.clinicName}${
      args.serviceName ? ` for ${args.serviceName}` : ""
    }${when ? ` on ${when}` : ""}.`,
  ];

  if (subjective) {
    paragraphs.push(`Presenting history:\n${subjective}`);
  }
  if (objective) {
    paragraphs.push(`Examination findings:\n${objective}`);
  }
  if (assessment) {
    paragraphs.push(`Clinical impression:\n${assessment}`);
  }
  if (plan) {
    paragraphs.push(`Plan and recommendations:\n${plan}`);
  }
  if (!subjective && !objective && !assessment && !plan) {
    paragraphs.push(
      "Please see the enclosed clinical note for the full consultation record.",
    );
  }

  paragraphs.push(
    `Please do not hesitate to contact the clinic if further information would be helpful.`,
    `Yours sincerely,\n${args.practitionerName}\n${args.clinicName}`,
  );

  return paragraphs.join("\n\n");
}

async function loadSignedNoteForDocuments(ctx: AuthContext, noteId: string) {
  assertCanAccessClinicalRecord(ctx);

  const note = await prisma.clinicalNote.findFirst({
    where: { id: noteId, patient: { clinicId: ctx.clinicId } },
    include: {
      patient: true,
      template: { select: { name: true } },
      visit: {
        include: {
          appointment: {
            include: {
              appointmentType: { select: { name: true } },
              practitioner: { select: { displayName: true } },
              clinic: { select: { name: true, timezone: true } },
            },
          },
        },
      },
    },
  });
  if (!note) throw notFound("Note not found");
  if (note.status !== NoteStatus.SIGNED) {
    throw badRequest("Only signed notes can be printed or used for GP letters");
  }

  const clinic =
    note.visit?.appointment.clinic ??
    (await prisma.clinic.findUniqueOrThrow({
      where: { id: ctx.clinicId },
      select: { name: true, timezone: true },
    }));

  return { note, clinic };
}

export async function getClinicalDocument(
  ctx: AuthContext,
  noteId: string,
): Promise<ClinicalDocument> {
  const { note, clinic } = await loadSignedNoteForDocuments(ctx, noteId);
  const sections = flattenNoteSections(note.content);

  await prisma.noteAuditEvent.create({
    data: {
      noteId: note.id,
      actorId: ctx.userId,
      action: "printed",
      meta: { kind: "clinical_note" },
    },
  });

  return {
    kind: "clinical_note",
    noteId: note.id,
    status: note.status,
    signedAt: note.signedAt?.toISOString() ?? null,
    clinic: { name: clinic.name, timezone: clinic.timezone },
    patient: {
      id: note.patient.id,
      fullName: `${note.patient.firstName} ${note.patient.lastName}`,
      dateOfBirth: note.patient.dateOfBirth?.toISOString() ?? null,
      email: note.patient.email,
      phone: note.patient.phone,
    },
    practitioner: note.visit?.appointment.practitioner
      ? { displayName: note.visit.appointment.practitioner.displayName }
      : null,
    serviceName: note.visit?.appointment.appointmentType.name ?? null,
    appointmentStartsAt:
      note.visit?.appointment.startsAt.toISOString() ?? null,
    templateName: note.template?.name ?? null,
    sections,
    printedAt: new Date().toISOString(),
  };
}

export async function getGpLetterDocument(
  ctx: AuthContext,
  noteId: string,
): Promise<GpLetterDocument> {
  const { note, clinic } = await loadSignedNoteForDocuments(ctx, noteId);
  const sections = flattenNoteSections(note.content);
  const practitionerName =
    note.visit?.appointment.practitioner.displayName ?? "Treating clinician";
  const patientName = `${note.patient.firstName} ${note.patient.lastName}`;
  const serviceName = note.visit?.appointment.appointmentType.name ?? null;
  const startsAt = note.visit?.appointment.startsAt ?? null;

  await prisma.noteAuditEvent.create({
    data: {
      noteId: note.id,
      actorId: ctx.userId,
      action: "letter_opened",
      meta: { kind: "gp_letter" },
    },
  });

  return {
    kind: "gp_letter",
    noteId: note.id,
    clinic: { name: clinic.name, timezone: clinic.timezone },
    patient: {
      id: note.patient.id,
      fullName: patientName,
      dateOfBirth: note.patient.dateOfBirth?.toISOString() ?? null,
    },
    practitioner: note.visit?.appointment.practitioner
      ? { displayName: note.visit.appointment.practitioner.displayName }
      : null,
    serviceName,
    appointmentStartsAt: startsAt?.toISOString() ?? null,
    gp: {
      name: note.patient.gpName,
      practice: note.patient.gpPractice,
      email: note.patient.gpEmail,
    },
    subject: `Clinical update — ${patientName}${serviceName ? ` (${serviceName})` : ""}`,
    body: composeLetterBody({
      practitionerName,
      clinicName: clinic.name,
      patientName,
      serviceName,
      appointmentStartsAt: startsAt,
      sections,
    }),
    signedAt: note.signedAt?.toISOString() ?? null,
    printedAt: new Date().toISOString(),
  };
}
