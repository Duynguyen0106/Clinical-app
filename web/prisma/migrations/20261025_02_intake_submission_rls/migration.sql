-- Clinic RLS for PatientIntakeSubmission (consent / intake PHI)
ALTER TABLE "PatientIntakeSubmission" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_intake_clinic_isolation ON "PatientIntakeSubmission";
CREATE POLICY patient_intake_clinic_isolation ON "PatientIntakeSubmission"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );
