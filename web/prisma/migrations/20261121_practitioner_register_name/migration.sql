-- Optional official register / legal name for itemised receipts
ALTER TABLE "PractitionerProfile"
  ADD COLUMN IF NOT EXISTS "registerName" TEXT;
