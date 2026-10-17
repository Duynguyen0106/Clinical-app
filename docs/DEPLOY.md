## Deploy — Treow Clinic (UK beta)

Minimal production path for design-partner beta. Prefer **UK/EU** regions.

Phone prep while waiting: see `docs/PHONE_CHECKLIST.md`.

Want **downloadable installers** (Windows/Mac/.apk/App Store)? After this web deploy is live, follow `docs/NATIVE_APP.md`.

**Selling Treow Clinic** (full clinic system + embed + provision + monthly Stripe): see `docs/SELL.md`.

## 0. Vercel + Neon (click path)

1. Create **Neon** project in Europe → copy `DATABASE_URL`.
2. Vercel → Import GitHub repo `Clinical-app`.
3. Set **Root Directory** to `web` (important).
4. `web/vercel.json` already sets Prisma generate + build.
5. Add env vars (below) → Deploy.
6. Set `APP_BASE_URL` to the `https://…vercel.app` URL → Redeploy.
7. From a computer, run schema against production DB:

```bash
cd web
DATABASE_URL="postgresql://…" npx prisma db push
DATABASE_URL="postgresql://…" npm run db:seed   # staging demo only
```

## 1. Provision

1. **Postgres** in `eu-west-2` / EU (Neon, Supabase, RDS, etc.)
2. **App host** with HTTPS (Vercel EU, Fly `lhr`/`ams`, Render EU, etc.)
3. **Resend** (or similar) domain for transactional email
4. Optional: S3-compatible bucket in UK/EU for audio when leaving local disk

## 2. Environment

Copy `web/.env.example` → production secrets. Required for production:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
AUTH_SECRET=<long random ≥ 32 chars>
AUDIO_ENCRYPTION_KEY=<different long random ≥ 32 chars>
APP_BASE_URL=https://your-app.example
SUPPORT_EMAIL=ops@yourdomain.com

AI_PROVIDER=mock
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM="Clinic Name <bookings@yourdomain.com>"
```

**Patient booking confirmations** require Resend (or another real provider). With `EMAIL_PROVIDER=console`, bookings still succeed but emails only log in the server — patients will not receive them. After setting Resend:

1. Verify your sending domain in the Resend dashboard  
2. Set `EMAIL_FROM` to an address on that domain  
3. Redeploy, then place a test book and check the inbox  

Optional later:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
# S3_* for remote audio

# Cloudflare Turnstile (public book + forgot-password when secret is set)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x…
TURNSTILE_SECRET_KEY=0x…
```

Auth and public write endpoints are rate-limited in-app (IP + email buckets). Turnstile is skipped until `TURNSTILE_SECRET_KEY` is set.

The app **refuses to boot in production** if `AUTH_SECRET` is missing or still the demo value.

## 3. Database

```bash
cd web
npx prisma db push
# optional demo only — do not seed real clinics with demo passwords
npm run db:seed
```

For a real clinic: create the clinic + owner via seed variant or admin SQL; never ship `treow-demo` to production patients.

## 3b. Live ship checklist (Nguyen’s / design partner)

After stacking clinical-safety → leak/live-day → re-audit-improve → post-65-harden → diary-scope → money-desk-scope PRs:

1. Undraft and merge to `main` in that order (or squash-equivalent tip): #63 → #64 → #65 → #66 → #67 → money-desk-scope.
2. Deploy Vercel (`web` root). Apply schema:
   ```bash
   cd web && DATABASE_URL="…" npx prisma db push
   # or migrate SQL under prisma/migrations/20261016_*
   ```
3. Set production env (minimum):
   - `AUTH_SECRET`, dedicated `AUDIO_ENCRYPTION_KEY` (≥32, not demo values — required at boot)
   - `CRON_SECRET` (≥24)
   - `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` + clinic email in Settings
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
   - Do **not** set `NEXT_PUBLIC_DEMO_LOGIN`
   - `AI_PROVIDER=mock` until LLM DPA
   - **Deposits = OFF** in clinic booking settings until Stripe confirm is live
     (`PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY`; never rely on public `mark_paid`)
   - UK/EU object storage for visit audio: `S3_BUCKET` + `S3_REGION=eu-west-2` (+ keys).
     Local `web/storage/` is ephemeral on Vercel and will lose recordings.
4. Wire reminders + organise (see §4). Confirm `GET /api/v1/health` shows `cronConfigured: true`, intended `smsProvider` / `emailProvider`, and `rateLimitBackend`.
5. Optional hardening — FORCE RLS runbook (prove on **staging** first with a non-owner `treow_app` role):
   ```bash
   # As migration/owner role:
   cd web && npm run db:rls
   # Create non-owner app role, grant DML, point DATABASE_URL at it, then:
   APPLY_FORCE_RLS=1 npm run db:rls
   ```
   Schedule create, deposit mark-paid, patient/leave/invoice writes set `app.clinic_id`.
   Details: `prisma/sql/002_force_rls.sql` and ARCHITECTURE.
   Multi-instance public book / rate limits: set `UPSTASH_REDIS_REST_URL` +
   `UPSTASH_REDIS_REST_TOKEN`. Even on staging, set a dedicated Stripe webhook
   secret when deposits are exercised.

## 4. Jobs (cron)

Set `CRON_SECRET` (≥24 chars). Vercel sends `Authorization: Bearer $CRON_SECRET`
for configured Cron Jobs.

`web/vercel.json` ships a **daily** retention cron (Hobby-compatible). Hourly
reminders and the organise drain need **Vercel Pro** (sub-daily schedules) **or**
an external scheduler calling the same GET routes with the bearer secret.

Example helper: [`web/scripts/cron-external.example.sh`](../web/scripts/cron-external.example.sh)

```bash
export APP_BASE_URL="https://…"
export CRON_SECRET="…"
# crontab: hourly reminders, every 5 min organise
./web/scripts/cron-external.example.sh reminders
./web/scripts/cron-external.example.sh organise
```

Or raw curl:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_BASE_URL/api/v1/jobs/reminders"
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_BASE_URL/api/v1/jobs/organise"
```

Staff sessions may still trigger **their own clinic only** from Settings
(reminders / organise / retention). Cron bearer sweeps all clinics.

| Schedule | Endpoint |
|----------|----------|
| Every hour (Pro or external) | `GET /api/v1/jobs/reminders` (staff may `POST`) |
| Every 5 min (Pro or external) | `GET /api/v1/jobs/organise` (drain AI note jobs) |
| Daily 03:15 UTC (in `vercel.json`) | `GET /api/v1/jobs/retention` |

Production boots warn if `CRON_SECRET` is missing or shorter than 24 characters.
Do not set `NEXT_PUBLIC_DEMO_LOGIN=true` on live clinic deployments — that advertises
demo emails and the `treow-demo` password on marketing/login surfaces.

**Deposits:** In production, `PAYMENT_PROVIDER=console` refuses to mark deposits paid
(avoids fake money). Use Stripe, or turn deposit requirements off in clinic settings.

**Rate limits:** In-memory by default. For multi-instance public book, set
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (shared fixed-window).

Audio: set `S3_BUCKET` + `S3_REGION=eu-west-2` + keys for durable UK object storage; otherwise files stay under `web/storage/`.

Optional: `cd web && npm run db:rls` applies clinic RLS policies (`prisma/sql/001_clinic_rls.sql`).
`APPLY_FORCE_RLS=1 npm run db:rls` also runs `002_force_rls.sql` (use only with a non-owner app role). App-layer `clinicId` filters remain primary.

## 5. Smoke after deploy

1. `GET /api/v1/health` → `{ "ok": true, ... }`
2. Staff login
3. Public book `/book/<slug>`
4. One Visit: consent → short record → organise → sign
5. Settings → export audits; confirm privacy link

## 6. Rollback

Keep previous deployment + DB snapshot. Audio files live under `web/storage/` locally or in the bucket — back them up with the same retention policy as the clinic setting.
