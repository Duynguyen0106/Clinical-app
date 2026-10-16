-- Re-audit improve: calendar privacy, practitioner↔service map

DO $$ BEGIN
  CREATE TYPE "CalendarPrivacyMode" AS ENUM ('FULL_NAME', 'INITIALS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "calendarPrivacyMode" "CalendarPrivacyMode" NOT NULL DEFAULT 'FULL_NAME';

CREATE TABLE IF NOT EXISTS "PractitionerService" (
  "id" TEXT NOT NULL,
  "practitionerId" TEXT NOT NULL,
  "appointmentTypeId" TEXT NOT NULL,
  CONSTRAINT "PractitionerService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PractitionerService_practitionerId_appointmentTypeId_key"
  ON "PractitionerService"("practitionerId", "appointmentTypeId");

CREATE INDEX IF NOT EXISTS "PractitionerService_appointmentTypeId_idx"
  ON "PractitionerService"("appointmentTypeId");

DO $$ BEGIN
  ALTER TABLE "PractitionerService"
    ADD CONSTRAINT "PractitionerService_practitionerId_fkey"
    FOREIGN KEY ("practitionerId") REFERENCES "PractitionerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PractitionerService"
    ADD CONSTRAINT "PractitionerService_appointmentTypeId_fkey"
    FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
