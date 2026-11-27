-- Patient file uploads (referral letters, imaging, attachments)

CREATE TABLE IF NOT EXISTS "PatientFile" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientFile_clinicId_patientId_createdAt_idx"
  ON "PatientFile"("clinicId", "patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "PatientFile_patientId_createdAt_idx"
  ON "PatientFile"("patientId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PatientFile"
    ADD CONSTRAINT "PatientFile_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PatientFile"
    ADD CONSTRAINT "PatientFile_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PatientFile"
    ADD CONSTRAINT "PatientFile_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
