-- Safer defaults for patient email automation (opt-in).
-- Reset clinics that never configured a review URL and still have the
-- previous "all on" defaults — avoids historical flood on first cron.

ALTER TABLE "Clinic"
  ALTER COLUMN "thankYouEnabled" SET DEFAULT false,
  ALTER COLUMN "reviewRequestEnabled" SET DEFAULT false,
  ALTER COLUMN "noShowFollowUpEnabled" SET DEFAULT false;

UPDATE "Clinic"
SET
  "thankYouEnabled" = false,
  "reviewRequestEnabled" = false,
  "noShowFollowUpEnabled" = false
WHERE "reviewUrl" IS NULL
  AND "thankYouEnabled" = true
  AND "reviewRequestEnabled" = true
  AND "noShowFollowUpEnabled" = true
  AND "sameDayReminderEnabled" = false;
