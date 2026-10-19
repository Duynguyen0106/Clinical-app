/**
 * Open-desk diary privacy — redact patient PII when clinic uses INITIALS mode.
 */

export type CalendarPrivacyMode = "FULL_NAME" | "INITIALS";

type PatientLike = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  alerts?: string | null;
  dateOfBirth?: Date | string | null;
  gpName?: string | null;
  gpPractice?: string | null;
  gpEmail?: string | null;
  nhsNumber?: string | null;
};

/** Display label for diary UI (grid / Today / sheet title). */
export function patientDiaryLabel(
  patient: { firstName: string; lastName: string },
  mode: CalendarPrivacyMode,
) {
  if (mode === "INITIALS") {
    const a = (patient.firstName[0] ?? "?").toUpperCase();
    const b = (patient.lastName[0] ?? "?").toUpperCase();
    return `${a}.${b}.`;
  }
  return `${patient.firstName} ${patient.lastName}`.trim();
}

/** Redact a patient payload for INITIALS diary responses. */
export function redactPatientForDiaryPrivacy<T extends PatientLike>(
  patient: T,
  mode: CalendarPrivacyMode,
): T {
  if (mode !== "INITIALS") return patient;
  const first = (patient.firstName[0] ?? "?").toUpperCase();
  const last = (patient.lastName[0] ?? "?").toUpperCase();
  return {
    ...patient,
    firstName: `${first}.`,
    lastName: `${last}.`,
    email: null,
    phone: null,
    // Keep clinical alerts — open-desk privacy must not hide safety flags
    dateOfBirth: null,
    gpName: null,
    gpPractice: null,
    gpEmail: null,
    nhsNumber: null,
  };
}

/** Apply diary privacy to an appointment-shaped object with nested patient. */
export function applyDiaryPrivacyToAppointment<
  T extends { patient: PatientLike },
>(appointment: T, mode: CalendarPrivacyMode): T {
  if (mode !== "INITIALS") return appointment;
  return {
    ...appointment,
    patient: redactPatientForDiaryPrivacy(appointment.patient, mode),
  };
}
