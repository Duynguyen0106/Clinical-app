-- Optional clinic website for itemised receipts / letterhead
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "website" TEXT;
