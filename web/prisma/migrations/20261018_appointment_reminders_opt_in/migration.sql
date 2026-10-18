-- Opt-in advance appointment reminders (safe default when hourly cron is wired).
ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "appointmentRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;
