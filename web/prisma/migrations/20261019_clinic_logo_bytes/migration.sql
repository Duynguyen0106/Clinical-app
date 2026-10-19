-- Store clinic brand logos in Postgres so uploads work on serverless hosts
-- without local disk or S3.
ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "logoBytes" BYTEA;
