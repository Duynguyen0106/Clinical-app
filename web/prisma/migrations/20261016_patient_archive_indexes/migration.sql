-- Soft-archive patients; keep clinical history
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Patient_clinicId_archivedAt_idx"
  ON "Patient"("clinicId", "archivedAt");

-- Appointment query path used by diaries and reminders
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_status_startsAt_idx"
  ON "Appointment"("clinicId", "status", "startsAt");

-- Prevent duplicate weekly open-hour windows
CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilityRule_practitionerId_dayOfWeek_startMinute_endMinute_key"
  ON "AvailabilityRule"("practitionerId", "dayOfWeek", "startMinute", "endMinute");
