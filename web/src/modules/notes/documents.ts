import { NoteStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { assertCanAccessClinicalRecord } from "@/server/rbac";

export type DocumentSection = { key: string; label: string; value: string };

export type LetterheadClinic = {
  name: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type LetterheadPractitioner = {
  displayName: string;
  professionalTitle: string | null;
  registrationBody: string | null;
  registrationNumber: string | null;
};

export type ClinicalDocument = {
  kind: "clinical_note";
  noteId: string;
  reference: string;
  status: string;
  signedAt: string | null;
  signedByName: string | null;
  clinic: LetterheadClinic;
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    nhsNumber: string | null;
  };
  practitioner: LetterheadPractitioner | null;
  locationName: string | null;
  locationAddress: string | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  templateName: string | null;
  sections: DocumentSection[];
  printedAt: string;
};

export type GpLetterDocument = {
  kind: "gp_letter";
  noteId: string;
  reference: string;
  clinic: LetterheadClinic;
  patient: {
    id: string;
    fullName: string;
    dateOfBirth: string | null;
    nhsNumber: string | null;
  };
  practitioner: LetterheadPractitioner | null;
  signedByName: string | null;
  locationName: string | null;
  locationAddress: string | null;
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

function shortRef(noteId: string) {
  return `TN-${noteId.slice(-8).toUpperCase()}`;
}

function mapPractitioner(
  p:
    | {
        displayName: string;
        professionalTitle: string | null;
        registrationBody: string | null;
        registrationNumber: string | null;
      }
    | null
    | undefined,
): LetterheadPractitioner | null {
  if (!p) return null;
  return {
    displayName: p.displayName,
    professionalTitle: p.professionalTitle,
    registrationBody: p.registrationBody,
    registrationNumber: p.registrationNumber,
  };
}

function composeLetterBody(args: {
  practitioner: LetterheadPractitioner;
  clinic: LetterheadClinic;
  patientName: string;
  nhsNumber: string | null;
  serviceName: string | null;
  appointmentStartsAt: Date | null;
  sections: DocumentSection[];
}) {
  const when = args.appointmentStartsAt
    ? args.appointmentStartsAt.toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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

  const reg =
    args.practitioner.registrationBody && args.practitioner.registrationNumber
      ? `${args.practitioner.registrationBody} ${args.practitioner.registrationNumber}`
      : args.practitioner.registrationNumber;

  const paragraphs: string[] = [
    `Dear Colleague,`,
    `I am writing regarding ${args.patientName}${
      args.nhsNumber ? ` (NHS ${args.nhsNumber})` : ""
    }, who attended ${args.clinic.name}${
      args.serviceName ? ` for ${args.serviceName}` : ""
    }${when ? ` on ${when}` : ""}.`,
  ];

  if (subjective) paragraphs.push(`Presenting history:\n${subjective}`);
  if (objective) paragraphs.push(`Examination findings:\n${objective}`);
  if (assessment) paragraphs.push(`Clinical impression:\n${assessment}`);
  if (plan) paragraphs.push(`Plan and recommendations:\n${plan}`);
  if (!subjective && !objective && !assessment && !plan) {
    paragraphs.push(
      "Please see the enclosed clinical note for the full consultation record.",
    );
  }

  const signOff = [
    "Please do not hesitate to contact the clinic if further information would be helpful.",
    `Yours sincerely,\n${args.practitioner.displayName}${
      args.practitioner.professionalTitle
        ? `\n${args.practitioner.professionalTitle}`
        : ""
    }${reg ? `\n${reg}` : ""}\n${args.clinic.name}${
      args.clinic.phone ? `\nTel: ${args.clinic.phone}` : ""
    }${args.clinic.email ? `\n${args.clinic.email}` : ""}`,
  ];

  return [...paragraphs, ...signOff].join("\n\n");
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
              practitioner: {
                select: {
                  displayName: true,
                  professionalTitle: true,
                  registrationBody: true,
                  registrationNumber: true,
                },
              },
              location: { select: { name: true, address: true } },
              clinic: {
                select: {
                  name: true,
                  timezone: true,
                  phone: true,
                  email: true,
                  address: true,
                },
              },
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
      select: {
        name: true,
        timezone: true,
        phone: true,
        email: true,
        address: true,
      },
    }));

  let signedByName: string | null = null;
  if (note.signedById) {
    const signer = await prisma.user.findUnique({
      where: { id: note.signedById },
      select: { name: true },
    });
    signedByName = signer?.name ?? null;
  }

  return { note, clinic, signedByName };
}

export async function getClinicalDocument(
  ctx: AuthContext,
  noteId: string,
): Promise<ClinicalDocument> {
  const { note, clinic, signedByName } = await loadSignedNoteForDocuments(
    ctx,
    noteId,
  );
  const sections = flattenNoteSections(note.content);
  const practitioner = mapPractitioner(note.visit?.appointment.practitioner);

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
    reference: shortRef(note.id),
    status: note.status,
    signedAt: note.signedAt?.toISOString() ?? null,
    signedByName,
    clinic: {
      name: clinic.name,
      timezone: clinic.timezone,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
    },
    patient: {
      id: note.patient.id,
      fullName: `${note.patient.firstName} ${note.patient.lastName}`,
      dateOfBirth: note.patient.dateOfBirth?.toISOString() ?? null,
      email: note.patient.email,
      phone: note.patient.phone,
      nhsNumber: note.patient.nhsNumber,
    },
    practitioner,
    locationName: note.visit?.appointment.location?.name ?? null,
    locationAddress: note.visit?.appointment.location?.address ?? null,
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
  const { note, clinic, signedByName } = await loadSignedNoteForDocuments(
    ctx,
    noteId,
  );
  const sections = flattenNoteSections(note.content);
  const practitioner =
    mapPractitioner(note.visit?.appointment.practitioner) ?? {
      displayName: "Treating clinician",
      professionalTitle: null,
      registrationBody: null,
      registrationNumber: null,
    };
  const patientName = `${note.patient.firstName} ${note.patient.lastName}`;
  const serviceName = note.visit?.appointment.appointmentType.name ?? null;
  const startsAt = note.visit?.appointment.startsAt ?? null;
  const letterheadClinic: LetterheadClinic = {
    name: clinic.name,
    timezone: clinic.timezone,
    phone: clinic.phone,
    email: clinic.email,
    address: clinic.address,
  };

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
    reference: shortRef(note.id),
    clinic: letterheadClinic,
    patient: {
      id: note.patient.id,
      fullName: patientName,
      dateOfBirth: note.patient.dateOfBirth?.toISOString() ?? null,
      nhsNumber: note.patient.nhsNumber,
    },
    practitioner,
    signedByName,
    locationName: note.visit?.appointment.location?.name ?? null,
    locationAddress: note.visit?.appointment.location?.address ?? null,
    serviceName,
    appointmentStartsAt: startsAt?.toISOString() ?? null,
    gp: {
      name: note.patient.gpName,
      practice: note.patient.gpPractice,
      email: note.patient.gpEmail,
    },
    subject: `Clinical update — ${patientName}${serviceName ? ` (${serviceName})` : ""}`,
    body: composeLetterBody({
      practitioner,
      clinic: letterheadClinic,
      patientName,
      nhsNumber: note.patient.nhsNumber,
      serviceName,
      appointmentStartsAt: startsAt,
      sections,
    }),
    signedAt: note.signedAt?.toISOString() ?? null,
    printedAt: new Date().toISOString(),
  };
}
