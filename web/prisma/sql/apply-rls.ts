/**
 * Apply clinic RLS SQL (idempotent DROP/CREATE POLICY).
 * Usage: npm run db:rls
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
  const sqlPath = path.join(__dirname, "001_clinic_rls.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied clinic RLS policies from", sqlPath);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
