/**
 * CI smoke: confirm RLS policies applied, clinic GUC works, and under FORCE
 * a mismatched clinic_id cannot read another clinic's Patient rows.
 * Expects DATABASE_URL after prisma db push + npm run db:rls (+ APPLY_FORCE_RLS=1).
 */
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const required = [
      "Patient",
      "Appointment",
      "ClinicalNote",
      "AppointmentAuditEvent",
      "NoteAuditEvent",
      "LeaveRequest",
      "Room",
    ];
    const policies = await client.query<{ tablename: string }>(
      `SELECT DISTINCT tablename FROM pg_policies
       WHERE tablename = ANY($1::text[])`,
      [required],
    );
    const tables = new Set(policies.rows.map((r) => r.tablename));
    for (const name of required) {
      if (!tables.has(name)) {
        throw new Error(`Missing RLS policy for ${name}`);
      }
    }

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

    // FORCE path: deny cross-clinic reads when GUC is set and bypass off
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

    const ids = visible.rows.map((r) => r.id);
    // Without FORCE, table owner may still see both — assert policies exist either way.
    // With FORCE (APPLY_FORCE_RLS=1), only smoke_p1 is visible.
    const forceOn = process.env.APPLY_FORCE_RLS === "1";
    if (forceOn) {
      if (ids.length !== 1 || ids[0] !== "smoke_p1") {
        throw new Error(
          `FORCE RLS denial failed: expected [smoke_p1], got [${ids.join(",")}]`,
        );
      }
      console.log("RLS FORCE denial ok: clinic_id=smoke_c1 sees only own patient");
    } else {
      console.log(
        "RLS ENABLE smoke ok (FORCE not applied in this run):",
        [...tables].sort().join(", "),
        `visible=${ids.join(",")}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
