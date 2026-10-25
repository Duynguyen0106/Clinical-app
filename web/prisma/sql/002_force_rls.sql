-- FORCE ROW LEVEL SECURITY (production hardening)
--
-- Apply AFTER 001_clinic_rls.sql and after creating a non-owner app DB role.
-- Table owners bypass ENABLE-only RLS; FORCE closes that bypass for the
-- applying role and all others except superuser / BYPASSRLS.
--
-- Recommended sequence (ops):
-- 1. CREATE ROLE treow_app LOGIN PASSWORD '…';
-- 2. GRANT CONNECT, USAGE ON SCHEMA public; GRANT SELECT/INSERT/UPDATE/DELETE
--    on application tables; GRANT USAGE/SELECT on sequences.
-- 3. Point DATABASE_URL at treow_app (migrations still use owner role).
-- 4. npm run db:rls && APPLY_FORCE_RLS=1 npm run db:rls
-- 5. Ensure every request path sets app.clinic_id via withClinicTransaction
--    (or app.rls_bypass=on for seed/cron only).

ALTER TABLE "Patient" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WaitlistEntry" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientAccessEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "NoteTemplate" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AiOrganiseJob" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Visit" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Recording" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Transcript" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentAuditEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "NoteAuditEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientConsent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientIntakeSubmission" FORCE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Room" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
