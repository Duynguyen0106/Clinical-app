#!/usr/bin/env bash
# External cron for Hobby (or any host without Vercel Pro sub-daily schedules).
# Configure:
#   export APP_BASE_URL="https://your-app.vercel.app"
#   export CRON_SECRET="…"   # ≥24 chars, same as production env
#
# Suggested crontab (UTC):
#   5 * * * *  /path/to/cron-external.example.sh reminders
#   */5 * * * * /path/to/cron-external.example.sh organise
# Retention stays in web/vercel.json (daily 03:15 UTC).

set -euo pipefail

JOB="${1:-}"
if [[ -z "${APP_BASE_URL:-}" || -z "${CRON_SECRET:-}" ]]; then
  echo "APP_BASE_URL and CRON_SECRET are required" >&2
  exit 1
fi

case "$JOB" in
  reminders)
    PATH_SUFFIX="/api/v1/jobs/reminders"
    ;;
  organise)
    PATH_SUFFIX="/api/v1/jobs/organise"
    ;;
  retention)
    PATH_SUFFIX="/api/v1/jobs/retention"
    ;;
  *)
    echo "Usage: $0 reminders|organise|retention" >&2
    exit 1
    ;;
esac

curl -sS -f -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_BASE_URL%/}${PATH_SUFFIX}"
echo
