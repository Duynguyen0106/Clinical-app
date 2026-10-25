import { z } from "zod";

export const OSTEO_CONSENT_FORM_KEY = "osteo_consent_v1";
export const OSTEO_CONSENT_FORM_VERSION = 1;

/** Shown when a re-consent pack replaced this submission's link. */
export const SUPERSEDED_INTAKE_LINK_MSG =
  "This consent link was replaced. Ask the clinic for a new link.";

/** Plain UK osteopathic treatment / examination consent copy. */
export const OSTEO_TREATMENT_CONSENT_TEXT = `I consent to osteopathic assessment and treatment. This may include case history questions, observation, movement testing, soft-tissue techniques, joint mobilisation or manipulation, and advice on exercise or self-care.

I understand that treatment can sometimes cause temporary soreness or stiffness, and that rare risks exist with hands-on care. I can ask questions, decline any technique, or stop at any time.

I confirm the information I provide is accurate to the best of my knowledge.`;

function isPastDateOfBirth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const min = new Date("1900-01-01T12:00:00.000Z");
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12),
  );
  return d >= min && d <= todayUtc;
}

export const intakeAnswersSchema = z.object({
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine(isPastDateOfBirth, "Date of birth must be a real past date")
    .nullable()
    .optional(),
  emergencyPhone: z.string().trim().max(40).nullable().optional(),
  safetyNote: z.string().trim().max(2000).nullable().optional(),
});

/** True when PatientConsent.meta came from the osteo consent pack. */
export function isOsteoIntakeConsentMeta(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { formKey?: unknown }).formKey === OSTEO_CONSENT_FORM_KEY;
}

export const intakeCompleteSchema = z.object({
  token: z.string().min(8),
  answers: intakeAnswersSchema.default({}),
  privacyConsent: z.literal(true),
  treatmentConsent: z.literal(true),
  marketingConsent: z.boolean().optional().default(false),
  signatureName: z.string().trim().min(2).max(120),
});

export const intakeDraftSchema = z.object({
  token: z.string().min(8),
  answers: intakeAnswersSchema,
});

export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

/** Normalize names for signature comparison (case/spacing/punctuation). */
export function normalizePersonName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function signatureMatchesPatient(
  signatureName: string,
  patient: { firstName: string; lastName: string },
) {
  const signed = normalizePersonName(signatureName);
  const first = normalizePersonName(patient.firstName);
  const last = normalizePersonName(patient.lastName);
  if (!signed || !first || !last) return false;

  const tokens = new Set(signed.split(" ").filter(Boolean));
  const firstParts = first.split(" ").filter(Boolean);
  const lastParts = last.split(" ").filter(Boolean);
  // Require every registered name part; allow middle / extra tokens
  return (
    firstParts.every((p) => tokens.has(p)) &&
    lastParts.every((p) => tokens.has(p))
  );
}
