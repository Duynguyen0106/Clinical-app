/**
 * Apply clinic RLS SQL (idempotent DROP/CREATE POLICY).
 * Usage:
 *   npm run db:rls
 *   APPLY_FORCE_RLS=1 npm run db:rls   # also FORCE policies (non-owner app role)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "dotenv/config";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const basePath = path.join(__dirname, "001_clinic_rls.sql");
    await client.query(readFileSync(basePath, "utf8"));
    console.log("Applied clinic RLS policies from", basePath);

    if (process.env.APPLY_FORCE_RLS === "1") {
      const forcePath = path.join(__dirname, "002_force_rls.sql");
      await client.query(readFileSync(forcePath, "utf8"));
      console.log("Applied FORCE ROW LEVEL SECURITY from", forcePath);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
