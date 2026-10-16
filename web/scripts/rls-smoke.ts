/**
 * CI smoke: confirm RLS policies applied and clinic GUC can be set.
 * Expects DATABASE_URL pointing at a fresh DB after prisma db push + npm run db:rls.
 */
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const policies = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies
       WHERE tablename IN ('Patient', 'Appointment', 'ClinicalNote', 'AppointmentAuditEvent')`,
    );
    const tables = new Set(policies.rows.map((r) => r.tablename));
    for (const required of [
      "Patient",
      "Appointment",
      "ClinicalNote",
      "AppointmentAuditEvent",
    ]) {
      if (!tables.has(required)) {
        throw new Error(`Missing RLS policy for ${required}`);
      }
    }

    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.clinic_id', $1, true)`,
      ["smoke_clinic"],
    );
    await client.query(`SELECT set_config('app.rls_bypass', 'off', true)`);
    await client.query("COMMIT");

    console.log("RLS smoke ok:", [...tables].sort().join(", "));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
