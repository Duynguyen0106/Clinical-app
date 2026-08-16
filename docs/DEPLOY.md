## Deploy — Treow Clinic (UK beta)

Minimal production path for design-partner beta. Prefer **UK/EU** regions.

Phone prep while waiting: see `docs/PHONE_CHECKLIST.md`.

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

Optional later:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
# S3_* for remote audio
```

The app **refuses to boot in production** if `AUTH_SECRET` is missing or still the demo value.

## 3. Database

```bash
cd web
npx prisma db push
# optional demo only — do not seed real clinics with demo passwords
npm run db:seed
```

For a real clinic: create the clinic + owner via seed variant or admin SQL; never ship `treow-demo` to production patients.

## 4. Jobs (cron)

Set `CRON_SECRET` (≥24 chars) and call with `Authorization: Bearer $CRON_SECRET`.
Staff sessions still work from Settings for manual runs.

| Schedule | Endpoint |
|----------|----------|
| Every hour | `POST /api/v1/jobs/reminders` |
| Every 2–5 min | `POST /api/v1/jobs/organise` (drain AI note jobs) |
| Daily | `POST /api/v1/jobs/retention` (all clinics when using cron secret) |

Audio: set `S3_BUCKET` + `S3_REGION=eu-west-2` + keys for durable UK object storage; otherwise files stay under `web/storage/`.

## 5. Smoke after deploy

1. `GET /api/v1/health` → `{ "ok": true, ... }`
2. Staff login
3. Public book `/book/<slug>`
4. One Visit: consent → short record → organise → sign
5. Settings → export audits; confirm privacy link

## 6. Rollback

Keep previous deployment + DB snapshot. Audio files live under `web/storage/` locally or in the bucket — back them up with the same retention policy as the clinic setting.
