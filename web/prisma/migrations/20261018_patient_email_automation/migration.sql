-- Patient email automation: clinic settings + appointment sent markers

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "reminderHoursBefore" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS "sameDayReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sameDayReminderHours" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "thankYouEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "thankYouDelayHours" INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS "reviewRequestEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reviewRequestDelayDays" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "reviewUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "noShowFollowUpEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "noShowFollowUpDelayHours" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "sameDayReminderSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "thankYouSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewRequestSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "noShowFollowUpSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Appointment_clinicId_thankYouSentAt_endsAt_idx"
  ON "Appointment"("clinicId", "thankYouSentAt", "endsAt");
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_reviewRequestSentAt_endsAt_idx"
  ON "Appointment"("clinicId", "reviewRequestSentAt", "endsAt");
