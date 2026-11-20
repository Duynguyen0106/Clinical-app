#!/usr/bin/env bash
# Production FORCE RLS apply — ENABLE policies + FORCE + treow_app denial smoke.
#
# Safe while Worker DATABASE_URL still uses neondb_owner (BYPASSRLS=true).
# Do NOT point the Worker at treow_app until every write path sets app.clinic_id
# (withClinicTransaction) and you have rotated treow_app's password out of band.
#
# Usage:
#   cd web
#   export DATABASE_URL='postgresql://…'   # owner / migration role (prefer DIRECT)
#   export CONFIRM_FORCE_RLS_PROD=1
#   ./scripts/force-rls-prod.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set — refuse to run FORCE RLS on prod." >&2
  exit 1
fi

if [[ "${CONFIRM_FORCE_RLS_PROD:-}" != "1" ]]; then
  echo "Set CONFIRM_FORCE_RLS_PROD=1 after pointing DATABASE_URL at the live Neon owner URL." >&2
  exit 1
fi

echo "→ Applying ENABLE RLS policies…"
npm run db:rls

echo "→ Applying FORCE RLS…"
APPLY_FORCE_RLS=1 npm run db:rls

echo "→ Running denial smoke as treow_app…"
APPLY_FORCE_RLS=1 npx tsx scripts/rls-smoke.ts

echo "→ Cleaning smoke clinic rows…"
npx tsx -e '
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT set_config('\''app.rls_bypass'\'', '\''on'\'', true)`);
  await c.query(`DELETE FROM "Patient" WHERE id IN ('\''smoke_p1'\'', '\''smoke_p2'\'')`);
  await c.query(`DELETE FROM "Clinic" WHERE id IN ('\''smoke_c1'\'', '\''smoke_c2'\'')`);
  await c.query("COMMIT");
  console.log("Smoke rows removed.");
} finally {
  await c.end();
}
'

echo "FORCE RLS prod apply + smoke OK."
echo "Note: Worker may still connect as neondb_owner (BYPASSRLS). Cut over DATABASE_URL to treow_app as a separate change."
