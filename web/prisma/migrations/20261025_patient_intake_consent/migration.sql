-- Consent-first osteopathic intake submissions
CREATE TABLE "PatientIntakeSubmission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "formKey" TEXT NOT NULL DEFAULT 'osteo_consent_v1',
    "formVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "answers" JSONB,
    "signatureName" TEXT,
    "signedAt" TIMESTAMP(3),
    "meta" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientIntakeSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientIntakeSubmission_clinicId_patientId_status_idx" ON "PatientIntakeSubmission"("clinicId", "patientId", "status");
CREATE INDEX "PatientIntakeSubmission_appointmentId_idx" ON "PatientIntakeSubmission"("appointmentId");
CREATE INDEX "PatientIntakeSubmission_clinicId_status_completedAt_idx" ON "PatientIntakeSubmission"("clinicId", "status", "completedAt");

ALTER TABLE "PatientIntakeSubmission" ADD CONSTRAINT "PatientIntakeSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientIntakeSubmission" ADD CONSTRAINT "PatientIntakeSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientIntakeSubmission" ADD CONSTRAINT "PatientIntakeSubmission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
