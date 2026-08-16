-- Clinic tenant RLS foundation (apply with: npm run db:rls)
--
-- Design:
-- - ENABLE ROW LEVEL SECURITY on clinic-scoped tables (not FORCE).
-- - Table owner (typical Prisma migrate/push role) bypasses RLS until you
--   switch the app to a non-owner role and FORCE policies.
-- - Policies match app.clinic_id session GUC, or allow when app.rls_bypass=on.
-- - Use withClinicTransaction() / setClinicRlsLocal() so pooled connections
--   never leak a clinic id across requests (SET LOCAL only).

-- Patients
ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_clinic_isolation ON "Patient";
CREATE POLICY patient_clinic_isolation ON "Patient"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- Appointments
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_clinic_isolation ON "Appointment";
CREATE POLICY appointment_clinic_isolation ON "Appointment"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- Waitlist
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_clinic_isolation ON "WaitlistEntry";
CREATE POLICY waitlist_clinic_isolation ON "WaitlistEntry"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- Invoices
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_clinic_isolation ON "Invoice";
CREATE POLICY invoice_clinic_isolation ON "Invoice"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- Access audit
ALTER TABLE "PatientAccessEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_event_clinic_isolation ON "PatientAccessEvent";
CREATE POLICY access_event_clinic_isolation ON "PatientAccessEvent"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- Note templates
ALTER TABLE "NoteTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS note_template_clinic_isolation ON "NoteTemplate";
CREATE POLICY note_template_clinic_isolation ON "NoteTemplate"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );

-- AI organise jobs
ALTER TABLE "AiOrganiseJob" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_job_clinic_isolation ON "AiOrganiseJob";
CREATE POLICY ai_job_clinic_isolation ON "AiOrganiseJob"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR nullif(current_setting('app.clinic_id', true), '') IS NULL
    OR "clinicId" = current_setting('app.clinic_id', true)
  );
