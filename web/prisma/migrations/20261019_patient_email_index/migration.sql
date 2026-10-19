-- Speed publicBook email match + patient directory lookup
CREATE INDEX IF NOT EXISTS "Patient_clinicId_email_idx" ON "Patient" ("clinicId", "email");
