-- Check-up rebook reminder: clinic opt-in + appointment claim marker

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "checkupReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "checkupReminderDelayDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "checkupReminderSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Appointment_clinicId_checkupReminderSentAt_endsAt_idx"
  ON "Appointment"("clinicId", "checkupReminderSentAt", "endsAt");
