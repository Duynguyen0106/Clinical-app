import { NoteStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { assertNoteDiaryAccess } from "@/modules/notes/access";
import { clinicLogoDataUrl } from "@/modules/clinic/profile";
import {
  BODY_MAP_CONTENT_KEY,
  bodyMapPrintLines,
  allCustomViews,
  parseBodyChartConfig,
  parseBodyMap,
  resolveCustomViewsForMap,
  sanitizeNoteContent,
  type BodyChartCustomView,
  type BodyMapContent,
} from "@/modules/notes/body-map";
import { hashNoteContent } from "@/modules/notes/hash";


export type DocumentSection = { key: string; label: string; value: string };

export type LetterheadClinic = {
  name: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  brandColour: string | null;
  logoDataUrl: string | null;
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
  /** Structured body chart for print figures (null when empty). */
  bodyMap: BodyMapContent | null;
  bodyChartCustomViews: BodyChartCustomView[];
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

/** Patient-facing copy of a signed note (print or email). */
export type PatientCopyDocument = {
  kind: "patient_copy";
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
  bodyMap: BodyMapContent | null;
  bodyChartCustomViews: BodyChartCustomView[];
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

export function flattenNoteSections(
  content: unknown,
  customViews?: BodyChartCustomView[],
): DocumentSection[] {
  const raw = asRecord(content);
  const nested =
    raw.sections && typeof raw.sections === "object" && !Array.isArray(raw.sections)
      ? (raw.sections as Record<string, unknown>)
      : raw;
  const out: DocumentSection[] = [];
  for (const [key, val] of Object.entries(nested)) {
    if (
      key === "flags" ||
      key === "sections" ||
      key === "clinician_review_flags" ||
      key === BODY_MAP_CONTENT_KEY
    ) {
      continue;
    }
    let text = "";
    if (typeof val === "string") text = val.trim();
    else if (val && typeof val === "object" && "text" in (val as object)) {
      text = String((val as { text?: unknown }).text ?? "").trim();
    }
    if (text) out.push({ key, label: titleCase(key), value: text });
  }
  const mapLines = bodyMapPrintLines(parseBodyMap(content), customViews);
  if (mapLines.length > 0) {
    out.push({
      key: BODY_MAP_CONTENT_KEY,
      label: "Body chart",
      value: mapLines.join("\n"),
    });
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

/**
 * Prefer visit diary practitioner; for visit-less signed notes, fall back to
 * the signer's clinic practitioner profile (letterhead credentials).
 */
export async function resolvePractitionerLetterhead(
  clinicId: string,
  args: {
    visitPractitioner:
      | {
          displayName: string;
          professionalTitle: string | null;
          registrationBody: string | null;
          registrationNumber: string | null;
        }
      | null
      | undefined;
    signedById: string | null;
  },
): Promise<LetterheadPractitioner | null> {
  const fromVisit = mapPractitioner(args.visitPractitioner);
  if (fromVisit) return fromVisit;
  if (!args.signedById) return null;
  const profile = await prisma.practitionerProfile.findFirst({
    where: {
      membership: { clinicId, userId: args.signedById },
    },
    select: {
      displayName: true,
      professionalTitle: true,
      registrationBody: true,
      registrationNumber: true,
    },
  });
  return mapPractitioner(profile);
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

  const bodyChart = sectionText(args.sections, [BODY_MAP_CONTENT_KEY, "body chart"]);

  if (subjective) paragraphs.push(`Presenting history:\n${subjective}`);
  if (objective) paragraphs.push(`Examination findings:\n${objective}`);
  if (bodyChart) paragraphs.push(`Body chart findings:\n${bodyChart}`);
  if (assessment) paragraphs.push(`Clinical impression:\n${assessment}`);
  if (plan) paragraphs.push(`Plan and recommendations:\n${plan}`);
  if (!subjective && !objective && !assessment && !plan && !bodyChart) {
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
  await assertNoteDiaryAccess(ctx, noteId);

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
                  id: true,
                  name: true,
                  timezone: true,
                  phone: true,
                  email: true,
                  address: true,
                  brandColour: true,
                  bodyChartConfig: true,
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
    throw badRequest(
      "Only signed notes can be printed, shared with patients, or used for GP letters",
    );
  }
  if (note.contentHash) {
    const raw =
      note.content && typeof note.content === "object" && !Array.isArray(note.content)
        ? (note.content as Record<string, unknown>)
        : {};
    const expected = hashNoteContent(sanitizeNoteContent(raw));
    if (expected !== note.contentHash) {
      throw badRequest(
        "Signed note content hash mismatch — record may be corrupted; contact support",
      );
    }
  }

  const clinic =
    note.visit?.appointment.clinic ??
    (await prisma.clinic.findUniqueOrThrow({
      where: { id: ctx.clinicId },
      select: {
        id: true,
        name: true,
        timezone: true,
        phone: true,
        email: true,
        address: true,
        brandColour: true,
        bodyChartConfig: true,
      },
    }));

  const logoDataUrl = await clinicLogoDataUrl(clinic.id);

  let signedByName: string | null = null;
  if (note.signedById) {
    const signer = await prisma.user.findUnique({
      where: { id: note.signedById },
      select: { name: true },
    });
    signedByName = signer?.name ?? null;
  }

  return { note, clinic, signedByName, logoDataUrl };
}

export async function getClinicalDocument(
  ctx: AuthContext,
  noteId: string,
): Promise<ClinicalDocument> {
  const { note, clinic, signedByName, logoDataUrl } =
    await loadSignedNoteForDocuments(ctx, noteId);
  const clinicViews = allCustomViews(
    parseBodyChartConfig(
      "bodyChartConfig" in clinic ? clinic.bodyChartConfig : null,
    ),
  );
  const bodyMap = parseBodyMap(note.content);
  const customViews = resolveCustomViewsForMap(bodyMap, clinicViews);
  const sections = flattenNoteSections(note.content, customViews);
  const practitioner = await resolvePractitionerLetterhead(ctx.clinicId, {
    visitPractitioner: note.visit?.appointment.practitioner,
    signedById: note.signedById,
  });

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
      brandColour: clinic.brandColour ?? null,
      logoDataUrl,
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
    bodyMap: bodyMap.marks.length > 0 ? bodyMap : null,
    bodyChartCustomViews: customViews,
    printedAt: new Date().toISOString(),
  };
}

export async function getGpLetterDocument(
  ctx: AuthContext,
  noteId: string,
): Promise<GpLetterDocument> {
  const { note, clinic, signedByName, logoDataUrl } =
    await loadSignedNoteForDocuments(ctx, noteId);
  const clinicViews = allCustomViews(
    parseBodyChartConfig(
      "bodyChartConfig" in clinic ? clinic.bodyChartConfig : null,
    ),
  );
  const customViews = resolveCustomViewsForMap(
    parseBodyMap(note.content),
    clinicViews,
  );
  const sections = flattenNoteSections(note.content, customViews);
  const practitioner =
    (await resolvePractitionerLetterhead(ctx.clinicId, {
      visitPractitioner: note.visit?.appointment.practitioner,
      signedById: note.signedById,
    })) ?? {
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
    brandColour: clinic.brandColour ?? null,
    logoDataUrl,
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

/**
 * Patient-facing export pack — same letterhead as the clinical print,
 * without internal clinician_review_flags (already omitted by flattenNoteSections).
 */
export async function getPatientCopyDocument(
  ctx: AuthContext,
  noteId: string,
  opts: { audit?: boolean } = {},
): Promise<PatientCopyDocument> {
  const { note, clinic, signedByName, logoDataUrl } =
    await loadSignedNoteForDocuments(ctx, noteId);
  const clinicViews = allCustomViews(
    parseBodyChartConfig(
      "bodyChartConfig" in clinic ? clinic.bodyChartConfig : null,
    ),
  );
  const bodyMap = parseBodyMap(note.content);
  const customViews = resolveCustomViewsForMap(bodyMap, clinicViews);
  const sections = flattenNoteSections(note.content, customViews);
  const practitioner = await resolvePractitionerLetterhead(ctx.clinicId, {
    visitPractitioner: note.visit?.appointment.practitioner,
    signedById: note.signedById,
  });

  if (opts.audit !== false) {
    await prisma.noteAuditEvent.create({
      data: {
        noteId: note.id,
        actorId: ctx.userId,
        action: "patient_copy_opened",
        meta: { kind: "patient_copy" },
      },
    });
  }

  return {
    kind: "patient_copy",
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
      brandColour: clinic.brandColour ?? null,
      logoDataUrl,
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
    bodyMap: bodyMap.marks.length > 0 ? bodyMap : null,
    bodyChartCustomViews: customViews,
    printedAt: new Date().toISOString(),
  };
}

/** Pure — strips internal flags from note content before patient export. */
export function patientFacingContent(
  content: unknown,
): Record<string, unknown> {
  const raw = asRecord(content);
  const out: Record<string, unknown> = { ...raw };
  delete out.clinician_review_flags;
  delete out.flags;
  return sanitizeNoteContent(out);
}

function escapeEmailHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEmailDateTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Build patient-copy email text + HTML from a document pack (pure).
 */
export function buildPatientCopyEmail(doc: PatientCopyDocument): {
  subject: string;
  text: string;
  html: string;
} {
  const when = formatEmailDateTime(doc.appointmentStartsAt);
  const subject = `Your visit summary — ${doc.clinic.name}${
    doc.serviceName ? ` (${doc.serviceName})` : ""
  }`;

  const prac = doc.practitioner;
  const reg =
    prac?.registrationBody && prac.registrationNumber
      ? `${prac.registrationBody} ${prac.registrationNumber}`
      : prac?.registrationNumber ?? null;

  const textLines: string[] = [
    doc.clinic.name,
    [doc.clinic.address, doc.clinic.phone, doc.clinic.email]
      .filter(Boolean)
      .join(" · "),
    "",
    `Dear ${doc.patient.fullName},`,
    "",
    `Here is a copy of your visit note${when ? ` from ${when}` : ""}${
      doc.serviceName ? ` (${doc.serviceName})` : ""
    }.`,
    "",
    `Reference: ${doc.reference}`,
  ];

  if (prac) {
    textLines.push(
      `Practitioner: ${prac.displayName}${
        prac.professionalTitle ? ` · ${prac.professionalTitle}` : ""
      }${reg ? ` · ${reg}` : ""}`,
    );
  }

  for (const section of doc.sections) {
    textLines.push("", section.label, section.value);
  }

  textLines.push(
    "",
    `Signed${doc.signedByName ? ` by ${doc.signedByName}` : ""}${
      doc.signedAt ? ` on ${formatEmailDateTime(doc.signedAt)}` : ""
    }.`,
    "",
    "If you have questions, please contact the clinic using the details above.",
    "",
    doc.clinic.name,
  );

  const sectionHtml = doc.sections
    .map(
      (s) =>
        `<h3 style="margin:1.25rem 0 0.35rem;font-size:1rem;">${escapeEmailHtml(
          s.label,
        )}</h3><p style="white-space:pre-wrap;margin:0;line-height:1.45;">${escapeEmailHtml(
          s.value,
        )}</p>`,
    )
    .join("");

  const accent = doc.clinic.brandColour || "#1E3F37";
  const logo = doc.clinic.logoDataUrl
    ? `<img src="${doc.clinic.logoDataUrl}" alt="" width="72" height="72" style="display:block;border-radius:8px;object-fit:contain;margin-bottom:0.75rem;" />`
    : "";

  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.5;max-width:640px;margin:0 auto;padding:1.25rem;">
${logo}
<p style="margin:0;font-size:1.25rem;font-weight:700;color:${escapeEmailHtml(accent)};">${escapeEmailHtml(doc.clinic.name)}</p>
<p style="margin:0.25rem 0 1rem;color:#444;font-size:0.9rem;">${escapeEmailHtml(
    [doc.clinic.address, doc.clinic.phone, doc.clinic.email]
      .filter(Boolean)
      .join(" · "),
  )}</p>
<p>Dear ${escapeEmailHtml(doc.patient.fullName)},</p>
<p>Here is a copy of your visit note${
    when ? ` from <strong>${escapeEmailHtml(when)}</strong>` : ""
  }${
    doc.serviceName
      ? ` (<strong>${escapeEmailHtml(doc.serviceName)}</strong>)`
      : ""
  }.</p>
<p style="color:#555;font-size:0.9rem;">Reference ${escapeEmailHtml(doc.reference)}${
    prac
      ? ` · ${escapeEmailHtml(prac.displayName)}${
          prac.professionalTitle
            ? ` · ${escapeEmailHtml(prac.professionalTitle)}`
            : ""
        }${reg ? ` · ${escapeEmailHtml(reg)}` : ""}`
      : ""
  }</p>
${sectionHtml}
<p style="margin-top:1.5rem;">Signed${
    doc.signedByName ? ` by ${escapeEmailHtml(doc.signedByName)}` : ""
  }${
    doc.signedAt
      ? ` on ${escapeEmailHtml(formatEmailDateTime(doc.signedAt) ?? "")}`
      : ""
  }.</p>
<p style="margin-top:1.25rem;color:#444;font-size:0.9rem;">If you have questions, please contact the clinic using the details above.</p>
<p style="margin-top:1rem;color:${escapeEmailHtml(accent)};font-weight:700;">${escapeEmailHtml(doc.clinic.name)}</p>
</body></html>`;

  return { subject, text: textLines.join("\n"), html };
}
