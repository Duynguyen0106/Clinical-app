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
 * Returns a fresh sealed URL when a send is needed.
 */
export async function ensureIntakeForAppointment(opts: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  /** Force a new DRAFT even if completed (staff resend after amend). */
  forceNewDraft?: boolean;
}) {
  if (!opts.forceNewDraft) {
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
      return { submission: completed, url: null as string | null, alreadyComplete: true };
    }
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

  const submission =
    existingDraft ??
    (await prisma.patientIntakeSubmission.create({
      data: {
        clinicId: opts.clinicId,
        patientId: opts.patientId,
        appointmentId: opts.appointmentId,
        formKey: OSTEO_CONSENT_FORM_KEY,
        formVersion: OSTEO_CONSENT_FORM_VERSION,
        status: "DRAFT",
        answers: {},
      },
    }));

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
          email: true,
          phone: true,
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
  if (
    submission.appointment &&
    TERMINAL.includes(submission.appointment.status)
  ) {
    throw badRequest("This appointment is no longer active");
  }

  return {
    status: submission.status,
    formKey: submission.formKey,
    formVersion: submission.formVersion,
    treatmentConsentText: OSTEO_TREATMENT_CONSENT_TEXT,
    answers: (submission.answers ?? {}) as IntakeAnswers,
    completedAt: submission.completedAt?.toISOString() ?? null,
    signedAt: submission.signedAt?.toISOString() ?? null,
    signatureName: submission.signatureName,
    patient: {
      firstName: submission.patient.firstName,
      lastName: submission.patient.lastName,
      email: submission.patient.email,
      phone: submission.patient.phone,
      dateOfBirth: submission.patient.dateOfBirth
        ? submission.patient.dateOfBirth.toISOString().slice(0, 10)
        : null,
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
  const submission = await prisma.patientIntakeSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true },
  });
  if (!submission) throw notFound("Consent form not found");
  if (submission.status === "COMPLETED") {
    throw badRequest("This consent pack is already signed");
  }
  return prisma.patientIntakeSubmission.update({
    where: { id: submissionId },
    data: { answers: parsed },
  });
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

  const ipHash = opts.ip
    ? createHash("sha256").update(opts.ip).digest("hex").slice(0, 32)
    : null;
  const now = new Date();

  await withClinicTransaction(submission.clinicId, async (tx) => {
    const patientPatch: {
      dateOfBirth?: Date;
      phone?: string;
      alerts?: string;
    } = {};
    if (!submission.patient.dateOfBirth && answers.dateOfBirth) {
      patientPatch.dateOfBirth = new Date(`${answers.dateOfBirth}T12:00:00.000Z`);
    }
    if (!submission.patient.phone && answers.emergencyPhone?.trim()) {
      patientPatch.phone = answers.emergencyPhone.trim();
    }
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

    await tx.patientIntakeSubmission.update({
      where: { id: submission.id },
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
  });

  return { alreadyComplete: false, submissionId: submission.id };
}

/** Staff: latest intake status for a patient. */
export async function getPatientIntakeStatus(
  ctx: AuthContext,
  patientId: string,
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId },
    select: { id: true },
  });
  if (!patient) throw notFound("Patient not found");

  const latest = await prisma.patientIntakeSubmission.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      formKey: OSTEO_CONSENT_FORM_KEY,
    },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
  });

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

export async function staffResendIntake(
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

  let appointmentId = opts.appointmentId ?? null;
  if (!appointmentId) {
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

  if (!appointmentId) {
    // Create a draft not tied to an appointment so they can still sign.
    const submission = await prisma.patientIntakeSubmission.create({
      data: {
        clinicId: ctx.clinicId,
        patientId: patient.id,
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
    };
  }

  const ensured = await ensureIntakeForAppointment({
    clinicId: ctx.clinicId,
    patientId: patient.id,
    appointmentId,
    forceNewDraft: true,
  });
  return {
    url: ensured.url,
    token: ensured.token,
    patient,
    alreadyComplete: ensured.alreadyComplete,
    submissionId: ensured.submission.id,
  };
}

export async function recordIntakeViewed(
  ctx: AuthContext,
  patientId: string,
  submissionId: string,
) {
  void prisma.patientAccessEvent
    .create({
      data: {
        clinicId: ctx.clinicId,
        patientId,
        actorId: ctx.userId,
        action: "intake_viewed",
        meta: { submissionId },
      },
    })
    .catch(() => undefined);
}
