import { createHash } from "crypto";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { withClinicTransaction } from "@/server/clinic-rls";
import {
  INTAKE_TOKEN_TTL_MS,
  createIntakeToken,
  intakeUrlForToken,
  verifyIntakeToken,
} from "./token";
import {
  OSTEO_CONSENT_FORM_KEY,
  OSTEO_CONSENT_FORM_VERSION,
  OSTEO_TREATMENT_CONSENT_TEXT,
  type IntakeAnswers,
  intakeAnswersSchema,
  signatureMatchesPatient,
} from "./schema";

const TERMINAL: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

export async function patientHasCompletedIntake(
  clinicId: string,
  patientId: string,
) {
  const row = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId,
      patientId,
      status: "COMPLETED",
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Ensure a DRAFT (or reuse COMPLETED) submission for an appointment.
 * Never orphans a COMPLETED pack. Prefers reusing a null-appointment DRAFT
 * (staff send before book) by attaching it to this appointment.
 */
export async function ensureIntakeForAppointment(opts: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
}) {
  const completed = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: opts.clinicId,
      patientId: opts.patientId,
      status: "COMPLETED",
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    orderBy: { completedAt: "desc" },
  });
  if (completed) {
    return {
      submission: completed,
      url: null as string | null,
      alreadyComplete: true,
    };
  }

  const existingDraft = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: opts.clinicId,
      patientId: opts.patientId,
      appointmentId: opts.appointmentId,
      status: "DRAFT",
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    orderBy: { startedAt: "desc" },
  });

  let submission = existingDraft;
  if (!submission) {
    const orphanDraft = await prisma.patientIntakeSubmission.findFirst({
      where: {
        clinicId: opts.clinicId,
        patientId: opts.patientId,
        appointmentId: null,
        status: "DRAFT",
        formKey: OSTEO_CONSENT_FORM_KEY,
      },
      orderBy: { startedAt: "desc" },
    });
    if (orphanDraft) {
      submission = await prisma.patientIntakeSubmission.update({
        where: { id: orphanDraft.id },
        data: { appointmentId: opts.appointmentId },
      });
    } else {
      submission = await prisma.patientIntakeSubmission.create({
        data: {
          clinicId: opts.clinicId,
          patientId: opts.patientId,
          appointmentId: opts.appointmentId,
          formKey: OSTEO_CONSENT_FORM_KEY,
          formVersion: OSTEO_CONSENT_FORM_VERSION,
          status: "DRAFT",
          answers: {},
        },
      });
    }
  }

  const token = createIntakeToken(
    submission.id,
    Date.now() + INTAKE_TOKEN_TTL_MS,
  );
  return {
    submission,
    url: intakeUrlForToken(token),
    token,
    alreadyComplete: false,
  };
}

export async function loadPublicIntake(token: string) {
  const { submissionId } = verifyIntakeToken(token);
  const submission = await prisma.patientIntakeSubmission.findUnique({
    where: { id: submissionId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      },
      clinic: {
        select: {
          id: true,
          name: true,
          slug: true,
          brandColour: true,
          logoStorageKey: true,
          phone: true,
        },
      },
      appointment: {
        select: {
          id: true,
          startsAt: true,
          status: true,
          appointmentType: { select: { name: true } },
          practitioner: { select: { displayName: true } },
        },
      },
    },
  });
  if (!submission) throw notFound("Consent form not found");
  // Allow DRAFT/COMPLETED load even if the linked appointment is terminal
  // (cancel/reschedule) so the patient can still finish or view the pack.
  const appointmentTerminal = Boolean(
    submission.appointment &&
      TERMINAL.includes(submission.appointment.status),
  );

  // Minimize PHI on the public GET — no email/phone/DOB from patient record.
  // Strip answers entirely once signed (token may be forwarded).
  const rawAnswers = (submission.answers ?? {}) as IntakeAnswers;
  const answers =
    submission.status === "COMPLETED"
      ? {
          dateOfBirth: null,
          emergencyPhone: null,
          safetyNote: null,
        }
      : {
          dateOfBirth: rawAnswers.dateOfBirth ?? null,
          emergencyPhone: rawAnswers.emergencyPhone ?? null,
          safetyNote: rawAnswers.safetyNote ?? null,
        };
  return {
    status: submission.status,
    formKey: submission.formKey,
    formVersion: submission.formVersion,
    treatmentConsentText: OSTEO_TREATMENT_CONSENT_TEXT,
    answers,
    completedAt: submission.completedAt?.toISOString() ?? null,
    signedAt: submission.signedAt?.toISOString() ?? null,
    signatureName: submission.signatureName,
    patient: {
      firstName: submission.patient.firstName,
      lastName: submission.patient.lastName,
      needsDateOfBirth: !submission.patient.dateOfBirth,
    },
    clinic: {
      name: submission.clinic.name,
      slug: submission.clinic.slug,
      brandColour: submission.clinic.brandColour,
      hasLogo: Boolean(submission.clinic.logoStorageKey),
      phone: submission.clinic.phone,
      logoUrl: submission.clinic.logoStorageKey
        ? `/api/v1/public/clinics/${submission.clinic.slug}/logo`
        : null,
    },
    appointment: submission.appointment
      ? {
          startsAt: submission.appointment.startsAt.toISOString(),
          serviceName: submission.appointment.appointmentType.name,
          practitionerName: submission.appointment.practitioner.displayName,
          inactive: appointmentTerminal,
        }
      : null,
  };
}

export async function savePublicDraft(
  token: string,
  answers: IntakeAnswers,
) {
  const { submissionId } = verifyIntakeToken(token);
  const parsed = intakeAnswersSchema.parse(answers);
  // Lock signed evidence: only DRAFT rows may receive answer updates.
  const updated = await prisma.patientIntakeSubmission.updateMany({
    where: { id: submissionId, status: "DRAFT" },
    data: { answers: parsed },
  });
  if (updated.count === 0) {
    const existing = await prisma.patientIntakeSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });
    if (!existing) throw notFound("Consent form not found");
    throw badRequest("This consent pack is already signed");
  }
  return { id: submissionId };
}

export async function completePublicIntake(opts: {
  token: string;
  answers: IntakeAnswers;
  privacyConsent: true;
  treatmentConsent: true;
  marketingConsent: boolean;
  signatureName: string;
  userAgent?: string | null;
  ip?: string | null;
}) {
  const { submissionId } = verifyIntakeToken(opts.token);
  const answers = intakeAnswersSchema.parse(opts.answers);
  const signatureName = opts.signatureName.trim();
  if (signatureName.length < 2) {
    throw badRequest("Please type your full name to sign");
  }

  const submission = await prisma.patientIntakeSubmission.findUnique({
    where: { id: submissionId },
    include: {
      patient: {
        select: {
          id: true,
          clinicId: true,
          dateOfBirth: true,
          phone: true,
          alerts: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
  if (!submission) throw notFound("Consent form not found");
  if (submission.status === "COMPLETED") {
    return { alreadyComplete: true, submissionId: submission.id };
  }
  if (
    !signatureMatchesPatient(signatureName, {
      firstName: submission.patient.firstName,
      lastName: submission.patient.lastName,
    })
  ) {
    throw badRequest(
      `Please type your name as registered (include ${submission.patient.firstName} and ${submission.patient.lastName})`,
    );
  }

  const ipHash = opts.ip
    ? createHash("sha256").update(opts.ip).digest("hex").slice(0, 32)
    : null;
  const now = new Date();

  const claimed = await withClinicTransaction(
    submission.clinicId,
    async (tx) => {
      // Claim DRAFT → COMPLETED first so concurrent submits cannot both win.
      const claim = await tx.patientIntakeSubmission.updateMany({
        where: { id: submission.id, status: "DRAFT" },
        data: {
          status: "COMPLETED",
          answers,
          signatureName,
          signedAt: now,
          completedAt: now,
          meta: {
            userAgent: opts.userAgent?.slice(0, 300) ?? null,
            ipHash,
          },
        },
      });
      if (claim.count === 0) {
        return false;
      }

      const patientPatch: {
        dateOfBirth?: Date;
        alerts?: string;
      } = {};
      if (!submission.patient.dateOfBirth && answers.dateOfBirth) {
        patientPatch.dateOfBirth = new Date(
          `${answers.dateOfBirth}T12:00:00.000Z`,
        );
      }
      // emergencyPhone stays in answers only — do not overwrite patient.phone
      const safety = answers.safetyNote?.trim();
      if (safety) {
        const prefix = `Safety (intake): ${safety}`;
        const existing = submission.patient.alerts?.trim();
        patientPatch.alerts = existing
          ? existing.includes(prefix)
            ? existing
            : `${prefix}\n${existing}`
          : prefix;
      }
      if (Object.keys(patientPatch).length > 0) {
        await tx.patient.update({
          where: { id: submission.patientId },
          data: patientPatch,
        });
      }

      const consentMeta = {
        intakeSubmissionId: submission.id,
        formKey: OSTEO_CONSENT_FORM_KEY,
        formVersion: OSTEO_CONSENT_FORM_VERSION,
        signatureName,
      };

      await tx.patientConsent.createMany({
        data: [
          {
            patientId: submission.patientId,
            type: "PRIVACY_POLICY",
            granted: true,
            method: "online_form",
            meta: consentMeta,
          },
          {
            patientId: submission.patientId,
            type: "TREATMENT",
            granted: true,
            method: "online_form",
            meta: {
              ...consentMeta,
              textVersion: "osteo_treatment_v1",
            },
          },
          ...(opts.marketingConsent
            ? [
                {
                  patientId: submission.patientId,
                  type: "MARKETING",
                  granted: true,
                  method: "online_form" as const,
                  meta: consentMeta,
                },
              ]
            : []),
        ],
      });

      return true;
    },
  );

  if (!claimed) {
    return { alreadyComplete: true, submissionId: submission.id };
  }

  return { alreadyComplete: false, submissionId: submission.id };
}

/** Staff: latest intake status for a patient (COMPLETED preferred over DRAFT). */
export async function getPatientIntakeStatus(
  ctx: AuthContext,
  patientId: string,
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId },
    select: { id: true },
  });
  if (!patient) throw notFound("Patient not found");

  const completed = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      formKey: OSTEO_CONSENT_FORM_KEY,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
  });
  const latest =
    completed ??
    (await prisma.patientIntakeSubmission.findFirst({
      where: {
        clinicId: ctx.clinicId,
        patientId,
        formKey: OSTEO_CONSENT_FORM_KEY,
        status: "DRAFT",
      },
      orderBy: { startedAt: "desc" },
    }));

  if (!latest) {
    return { status: "NONE" as const, submission: null };
  }

  const answers = (latest.answers ?? {}) as IntakeAnswers;
  return {
    status: latest.status as "DRAFT" | "COMPLETED",
    submission: {
      id: latest.id,
      formKey: latest.formKey,
      formVersion: latest.formVersion,
      status: latest.status,
      answers,
      signatureName: latest.signatureName,
      signedAt: latest.signedAt?.toISOString() ?? null,
      completedAt: latest.completedAt?.toISOString() ?? null,
      appointmentId: latest.appointmentId,
      treatmentConsentText: OSTEO_TREATMENT_CONSENT_TEXT,
    },
  };
}

/**
 * Staff: prepare a consent link for email.
 * - Bounds appointmentId to this clinic + patient (IDOR-safe)
 * - Reuses existing DRAFT; does not orphan a COMPLETED pack
 */
export async function staffPrepareIntakeSend(
  ctx: AuthContext,
  opts: { patientId: string; appointmentId?: string | null },
) {
  if (ctx.role === "PRACTITIONER" || ctx.role === "READ_ONLY") {
    throw forbidden("Only owners or reception can send consent forms");
  }
  const patient = await prisma.patient.findFirst({
    where: { id: opts.patientId, clinicId: ctx.clinicId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!patient) throw notFound("Patient not found");
  if (!patient.email?.trim()) {
    throw badRequest("Patient needs an email address to receive the consent link");
  }

  let appointmentId: string | null = null;
  if (opts.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: {
        id: opts.appointmentId,
        clinicId: ctx.clinicId,
        patientId: patient.id,
      },
      select: { id: true },
    });
    if (!apt) {
      throw badRequest("Appointment not found for this patient");
    }
    appointmentId = apt.id;
  } else {
    const upcoming = await prisma.appointment.findFirst({
      where: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
        startsAt: { gte: new Date() },
        status: { notIn: TERMINAL },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true },
    });
    appointmentId = upcoming?.id ?? null;
  }

  const completed = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId: patient.id,
      status: "COMPLETED",
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    select: { id: true },
  });
  if (completed) {
    return {
      url: null as string | null,
      token: null as string | null,
      patient,
      alreadyComplete: true,
      submissionId: completed.id,
      appointmentId,
    };
  }

  if (appointmentId) {
    const ensured = await ensureIntakeForAppointment({
      clinicId: ctx.clinicId,
      patientId: patient.id,
      appointmentId,
    });
    return {
      url: ensured.url,
      token: ensured.token ?? null,
      patient,
      alreadyComplete: ensured.alreadyComplete,
      submissionId: ensured.submission.id,
      appointmentId,
    };
  }

  // No upcoming appointment — reuse open DRAFT or create one without appointment.
  const existingDraft = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId: patient.id,
      status: "DRAFT",
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    orderBy: { startedAt: "desc" },
  });
  const submission =
    existingDraft ??
    (await prisma.patientIntakeSubmission.create({
      data: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
        formKey: OSTEO_CONSENT_FORM_KEY,
        formVersion: OSTEO_CONSENT_FORM_VERSION,
        status: "DRAFT",
        answers: {},
      },
    }));
  const token = createIntakeToken(submission.id);
  return {
    url: intakeUrlForToken(token),
    token,
    patient,
    alreadyComplete: false,
    submissionId: submission.id,
    appointmentId: null,
  };
}

/** @deprecated use staffPrepareIntakeSend */
export async function staffResendIntake(
  ctx: AuthContext,
  opts: { patientId: string; appointmentId?: string | null },
) {
  return staffPrepareIntakeSend(ctx, opts);
}

/**
 * Explicit re-consent: supersede prior COMPLETED packs, open a new DRAFT, return URL.
 * Does not email — caller sends using the returned url.
 */
export async function staffRequestReconsent(
  ctx: AuthContext,
  opts: { patientId: string; appointmentId?: string | null },
) {
  if (ctx.role === "PRACTITIONER" || ctx.role === "READ_ONLY") {
    throw forbidden("Only owners or reception can request re-consent");
  }
  const patient = await prisma.patient.findFirst({
    where: { id: opts.patientId, clinicId: ctx.clinicId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!patient) throw notFound("Patient not found");
  if (!patient.email?.trim()) {
    throw badRequest("Patient needs an email address to receive the consent link");
  }

  let appointmentId: string | null = null;
  if (opts.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: {
        id: opts.appointmentId,
        clinicId: ctx.clinicId,
        patientId: patient.id,
      },
      select: { id: true },
    });
    if (!apt) {
      throw badRequest("Appointment not found for this patient");
    }
    appointmentId = apt.id;
  } else {
    const upcoming = await prisma.appointment.findFirst({
      where: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
        startsAt: { gte: new Date() },
        status: { notIn: TERMINAL },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true },
    });
    appointmentId = upcoming?.id ?? null;
  }

  await withClinicTransaction(ctx.clinicId, async (tx) => {
    await tx.patientIntakeSubmission.updateMany({
      where: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
        formKey: OSTEO_CONSENT_FORM_KEY,
        status: "COMPLETED",
      },
      data: { status: "SUPERSEDED" },
    });
    // Drop open drafts so the new pack is the only live one
    await tx.patientIntakeSubmission.updateMany({
      where: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
        formKey: OSTEO_CONSENT_FORM_KEY,
        status: "DRAFT",
      },
      data: { status: "SUPERSEDED" },
    });
  });

  const submission = await prisma.patientIntakeSubmission.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: patient.id,
      appointmentId,
      formKey: OSTEO_CONSENT_FORM_KEY,
      formVersion: OSTEO_CONSENT_FORM_VERSION,
      status: "DRAFT",
      answers: {},
    },
  });
  const token = createIntakeToken(submission.id);
  return {
    url: intakeUrlForToken(token),
    token,
    patient,
    alreadyComplete: false,
    submissionId: submission.id,
    appointmentId,
    reconsent: true as const,
  };
}

export async function recordIntakeViewed(
  ctx: AuthContext,
  patientId: string,
  submissionId: string,
  meta?: { status?: string },
) {
  void prisma.patientAccessEvent
    .create({
      data: {
        clinicId: ctx.clinicId,
        patientId,
        actorId: ctx.userId,
        action: "intake_viewed",
        meta: { submissionId, ...meta },
      },
    })
    .catch(() => undefined);
}
