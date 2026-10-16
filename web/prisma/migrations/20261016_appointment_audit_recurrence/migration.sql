-- Diary change audit trail
CREATE TABLE IF NOT EXISTS "AppointmentAuditEvent" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AppointmentAuditEvent_clinicId_createdAt_idx"
  ON "AppointmentAuditEvent"("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppointmentAuditEvent_appointmentId_createdAt_idx"
  ON "AppointmentAuditEvent"("appointmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppointmentAuditEvent_actorId_createdAt_idx"
  ON "AppointmentAuditEvent"("actorId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AppointmentAuditEvent"
    ADD CONSTRAINT "AppointmentAuditEvent_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentAuditEvent"
    ADD CONSTRAINT "AppointmentAuditEvent_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recurring series lookup
CREATE INDEX IF NOT EXISTS "Appointment_recurrenceGroupId_idx"
  ON "Appointment"("recurrenceGroupId");
