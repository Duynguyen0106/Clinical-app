-- At most one live DRAFT consent pack per patient+form (prevents concurrent ensure races).
-- Keep the newest DRAFT; supersede any older duplicates first.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "clinicId", "patientId", "formKey"
      ORDER BY "startedAt" DESC, id DESC
    ) AS rn
  FROM "PatientIntakeSubmission"
  WHERE status = 'DRAFT'
)
UPDATE "PatientIntakeSubmission" AS s
SET status = 'SUPERSEDED'
FROM ranked AS r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "PatientIntakeSubmission_one_live_draft_idx"
ON "PatientIntakeSubmission" ("clinicId", "patientId", "formKey")
WHERE status = 'DRAFT';
