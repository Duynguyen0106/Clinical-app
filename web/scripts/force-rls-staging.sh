#!/usr/bin/env bash
# Staging FORCE RLS apply — prove non-owner treow_app + FORCE before pilot.
# Requires DATABASE_URL pointing at a *staging* owner/migration role.
# See docs/DEPLOY.md §3b and prisma/sql/002_force_rls.sql.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set — refuse to run FORCE RLS." >&2
  exit 1
fi

if [[ "${CONFIRM_FORCE_RLS_STAGING:-}" != "1" ]]; then
  echo "Set CONFIRM_FORCE_RLS_STAGING=1 after pointing DATABASE_URL at staging." >&2
  exit 1
fi

echo "→ Applying ENABLE RLS policies…"
npm run db:rls

echo "→ Applying FORCE RLS…"
APPLY_FORCE_RLS=1 npm run db:rls

echo "→ Running denial smoke as treow_app…"
APPLY_FORCE_RLS=1 npx tsx scripts/rls-smoke.ts

echo "FORCE RLS staging apply + smoke OK."
