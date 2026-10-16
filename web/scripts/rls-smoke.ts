/**
 * CI smoke: confirm RLS policies applied, clinic GUC works, and under FORCE
 * a non-superuser role with mismatched clinic_id cannot read another clinic's
 * Patient rows.
 *
 * Expects DATABASE_URL (owner/superuser) after prisma db push + npm run db:rls.
 * When APPLY_FORCE_RLS=1, creates/uses treow_app (NOSUPERUSER) for denial.
 */
import pg from "pg";

const REQUIRED_TABLES = [
  "Patient",
  "Appointment",
  "ClinicalNote",
  "AppointmentAuditEvent",
  "NoteAuditEvent",
  "LeaveRequest",
  "Room",
];

async function assertPolicies(client: pg.Client) {
  const policies = await client.query<{ tablename: string }>(
    `SELECT DISTINCT tablename FROM pg_policies
     WHERE tablename = ANY($1::text[])`,
    [REQUIRED_TABLES],
  );
  const tables = new Set(policies.rows.map((r) => r.tablename));
  for (const name of REQUIRED_TABLES) {
    if (!tables.has(name)) {
      throw new Error(`Missing RLS policy for ${name}`);
    }
  }
  return tables;
}

async function seedClinics(client: pg.Client) {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
  await client.query(
    `INSERT INTO "Clinic" (id, name, slug, timezone, "updatedAt")
     VALUES
       ('smoke_c1', 'Clinic One', 'smoke-c1', 'Europe/London', NOW()),
       ('smoke_c2', 'Clinic Two', 'smoke-c2', 'Europe/London', NOW())
     ON CONFLICT (id) DO NOTHING`,
  );
  await client.query(
    `INSERT INTO "Patient" (id, "clinicId", "firstName", "lastName", "updatedAt")
     VALUES
       ('smoke_p1', 'smoke_c1', 'Ada', 'One', NOW()),
       ('smoke_p2', 'smoke_c2', 'Bea', 'Two', NOW())
     ON CONFLICT (id) DO NOTHING`,
  );
  await client.query("COMMIT");
}

async function ensureAppRole(owner: pg.Client) {
  await owner.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'treow_app') THEN
        CREATE ROLE treow_app LOGIN PASSWORD 'treow_app' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
  `);
  await owner.query(`GRANT CONNECT ON DATABASE treow TO treow_app`);
  await owner.query(`GRANT USAGE ON SCHEMA public TO treow_app`);
  await owner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO treow_app`,
  );
  await owner.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO treow_app`,
  );
}

async function visiblePatients(url: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.rls_bypass', 'off', true)`);
    await client.query(
      `SELECT set_config('app.clinic_id', $1, true)`,
      ["smoke_c1"],
    );
    const visible = await client.query<{ id: string }>(
      `SELECT id FROM "Patient" WHERE id IN ('smoke_p1', 'smoke_p2') ORDER BY id`,
    );
    await client.query("COMMIT");
    return visible.rows.map((r) => r.id);
  } finally {
    await client.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const owner = new pg.Client({ connectionString });
  await owner.connect();
  try {
    const tables = await assertPolicies(owner);
    await seedClinics(owner);

    await owner.query("BEGIN");
    await owner.query(
      `SELECT set_config('app.clinic_id', $1, true)`,
      ["smoke_clinic"],
    );
    await owner.query(`SELECT set_config('app.rls_bypass', 'off', true)`);
    await owner.query("COMMIT");

    const forceOn = process.env.APPLY_FORCE_RLS === "1";
    if (!forceOn) {
      console.log(
        "RLS ENABLE smoke ok:",
        [...tables].sort().join(", "),
      );
      return;
    }

    const forced = await owner.query<{ relname: string }>(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'Patient'
         AND c.relforcerowsecurity = true`,
    );
    if (forced.rowCount === 0) {
      throw new Error("Patient.relforcerowsecurity is not true after FORCE");
    }

    await ensureAppRole(owner);
    const appUrl = connectionString.replace(
      /\/\/([^:]+):([^@]+)@/,
      "//treow_app:treow_app@",
    );
    const ids = await visiblePatients(appUrl);
    if (ids.length !== 1 || ids[0] !== "smoke_p1") {
      throw new Error(
        `FORCE RLS denial failed as treow_app: expected [smoke_p1], got [${ids.join(",")}]`,
      );
    }
    console.log(
      "RLS FORCE denial ok: treow_app with clinic_id=smoke_c1 sees only own patient",
    );
  } finally {
    await owner.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
