-- 90-day win-back email + appointment promo percent for automatic fee discount

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "winBackReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "winBackReminderDelayDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "winBackReminderSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoPercentOff" INTEGER;

CREATE INDEX IF NOT EXISTS "Appointment_clinicId_winBackReminderSentAt_endsAt_idx"
  ON "Appointment"("clinicId", "winBackReminderSentAt", "endsAt");
