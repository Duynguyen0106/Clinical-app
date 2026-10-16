-- Clinic tenant RLS foundation (apply with: npm run db:rls)
--
-- Design:
-- - ENABLE ROW LEVEL SECURITY on clinic-scoped tables (not FORCE).
-- - Table owner (typical Prisma migrate/push role) bypasses RLS until you
--   switch the app to a non-owner role and FORCE policies.
-- - Policies match app.clinic_id session GUC, or allow when app.rls_bypass=on.
-- - Empty app.clinic_id NO LONGER allows all rows (defense in depth).
-- - Use withClinicTransaction() / setClinicRlsLocal() so pooled connections
--   never leak a clinic id across requests (SET LOCAL only).

-- Patients
ALTER TABLE "Patient" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_clinic_isolation ON "Patient";
CREATE POLICY patient_clinic_isolation ON "Patient"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Appointments
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_clinic_isolation ON "Appointment";
CREATE POLICY appointment_clinic_isolation ON "Appointment"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Waitlist
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_clinic_isolation ON "WaitlistEntry";
CREATE POLICY waitlist_clinic_isolation ON "WaitlistEntry"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Invoices
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_clinic_isolation ON "Invoice";
CREATE POLICY invoice_clinic_isolation ON "Invoice"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Access audit
ALTER TABLE "PatientAccessEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_event_clinic_isolation ON "PatientAccessEvent";
CREATE POLICY access_event_clinic_isolation ON "PatientAccessEvent"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Note templates
ALTER TABLE "NoteTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS note_template_clinic_isolation ON "NoteTemplate";
CREATE POLICY note_template_clinic_isolation ON "NoteTemplate"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- AI organise jobs
ALTER TABLE "AiOrganiseJob" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_job_clinic_isolation ON "AiOrganiseJob";
CREATE POLICY ai_job_clinic_isolation ON "AiOrganiseJob"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Visits (via appointment.clinicId)
ALTER TABLE "Visit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visit_clinic_isolation ON "Visit";
CREATE POLICY visit_clinic_isolation ON "Visit"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a.id = "Visit"."appointmentId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a.id = "Visit"."appointmentId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Clinical notes (via patient.clinicId)
ALTER TABLE "ClinicalNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_note_clinic_isolation ON "ClinicalNote";
CREATE POLICY clinical_note_clinic_isolation ON "ClinicalNote"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "ClinicalNote"."patientId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "ClinicalNote"."patientId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Recordings (via visit → appointment)
ALTER TABLE "Recording" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recording_clinic_isolation ON "Recording";
CREATE POLICY recording_clinic_isolation ON "Recording"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Visit" v
      JOIN "Appointment" a ON a.id = v."appointmentId"
      WHERE v.id = "Recording"."visitId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Visit" v
      JOIN "Appointment" a ON a.id = v."appointmentId"
      WHERE v.id = "Recording"."visitId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Transcripts (via recording → visit → appointment)
ALTER TABLE "Transcript" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcript_clinic_isolation ON "Transcript";
CREATE POLICY transcript_clinic_isolation ON "Transcript"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Recording" r
      JOIN "Visit" v ON v.id = r."visitId"
      JOIN "Appointment" a ON a.id = v."appointmentId"
      WHERE r.id = "Transcript"."recordingId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Recording" r
      JOIN "Visit" v ON v.id = r."visitId"
      JOIN "Appointment" a ON a.id = v."appointmentId"
      WHERE r.id = "Transcript"."recordingId"
        AND a."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Schedule audit trail
ALTER TABLE "AppointmentAuditEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_audit_clinic_isolation ON "AppointmentAuditEvent";
CREATE POLICY appointment_audit_clinic_isolation ON "AppointmentAuditEvent"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Note audit events (via note → patient)
ALTER TABLE "NoteAuditEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS note_audit_clinic_isolation ON "NoteAuditEvent";
CREATE POLICY note_audit_clinic_isolation ON "NoteAuditEvent"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "ClinicalNote" n
      JOIN "Patient" p ON p.id = n."patientId"
      WHERE n.id = "NoteAuditEvent"."noteId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "ClinicalNote" n
      JOIN "Patient" p ON p.id = n."patientId"
      WHERE n.id = "NoteAuditEvent"."noteId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Patient consents (via patient)
ALTER TABLE "PatientConsent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_consent_clinic_isolation ON "PatientConsent";
CREATE POLICY patient_consent_clinic_isolation ON "PatientConsent"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "PatientConsent"."patientId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Patient" p
      WHERE p.id = "PatientConsent"."patientId"
        AND p."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );

-- Leave requests
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_request_clinic_isolation ON "LeaveRequest";
CREATE POLICY leave_request_clinic_isolation ON "LeaveRequest"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Rooms
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_clinic_isolation ON "Room";
CREATE POLICY room_clinic_isolation ON "Room"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR "clinicId" = nullif(current_setting('app.clinic_id', true), '')
  );

-- Payments (via invoice)
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_clinic_isolation ON "Payment";
CREATE POLICY payment_clinic_isolation ON "Payment"
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i.id = "Payment"."invoiceId"
        AND i."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i.id = "Payment"."invoiceId"
        AND i."clinicId" = nullif(current_setting('app.clinic_id', true), '')
    )
  );
