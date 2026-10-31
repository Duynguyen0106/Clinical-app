-- Clinic patient prep tips (clothes / what to bring) for booking confirmation email
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "patientPrepText" TEXT;
