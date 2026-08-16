# Deploy — Treow Clinic (UK beta)

Minimal production path for design-partner beta. Prefer **UK/EU** regions.

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

Call with a staff/owner Bearer token (or add a cron secret later):

| Schedule | Endpoint |
|----------|----------|
| Every hour | `POST /api/v1/jobs/reminders` |
| Daily | `POST /api/v1/jobs/retention` |

## 5. Smoke after deploy

1. `GET /api/v1/health` → `{ "ok": true, ... }`
2. Staff login
3. Public book `/book/<slug>`
4. One Visit: consent → short record → organise → sign
5. Settings → export audits; confirm privacy link

## 6. Rollback

Keep previous deployment + DB snapshot. Audio files live under `web/storage/` locally or in the bucket — back them up with the same retention policy as the clinic setting.
