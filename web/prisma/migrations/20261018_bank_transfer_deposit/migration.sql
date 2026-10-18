-- Clinic bank details for deposit-by-transfer (no Stripe).
ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "depositBankAccountName" TEXT,
  ADD COLUMN IF NOT EXISTS "depositBankSortCode" TEXT,
  ADD COLUMN IF NOT EXISTS "depositBankAccountNumber" TEXT;
