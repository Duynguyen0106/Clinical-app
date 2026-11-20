# Cloudflare Workers deploy (OpenNext)

Treow Clinic runs on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

Production Worker name: `treow-clinic`  
Live URL: **https://treow-clinic.duydichdanh.workers.dev**

Prisma client is generated with `runtime = "cloudflare"` so Workers do not compile query-compiler WASM at runtime.

## Prerequisites

1. Cloudflare account API token with Workers Scripts Edit + Account read  
2. **Neon** `DATABASE_URL` (Europe) — Workers cannot use TCP `pg` pools; the app uses `@prisma/adapter-neon` **WebSocket** mode (`PrismaNeon`) for `neon.tech` URLs / `CLOUDFLARE_WORKERS=1`. Do not use `PrismaNeonHttp` — booking and other paths need `$transaction`.  
3. **Enable R2** (subscribe to R2 if needed), then create:
   - `treow-clinic-cache` — OpenNext incremental cache (optional but recommended)
   - `treow-clinic-media` — encrypted visit audio (S3-compatible)
4. R2 Account API token → derive S3 credentials (`Access Key ID` = token `id`,
   `Secret Access Key` = SHA-256 hex of token `value`) and set Worker secrets:
   - `S3_BUCKET=treow-clinic-media`
   - `S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY`
5. Confirm recording works: `APP_BASE_URL=… PILOT_EMAIL=… PILOT_PASSWORD=… npx tsx scripts/pilot-visit-smoke.ts`
   (without S3_* the script reports `recordingBlocked` and stops before organise/sign).

**Status (2026-11-20):** Bucket `treow-clinic-media` exists; Worker `treow-clinic` has
`S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_ENDPOINT` / `S3_REGION` set.

## One-time secrets

From `web/`:

```bash
export CLOUDFLARE_API_TOKEN=…   # or wrangler login
export CLOUDFLARE_ACCOUNT_ID=…

npx wrangler secret put DATABASE_URL
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUDIO_ENCRYPTION_KEY
npx wrangler secret put CRON_SECRET
npx wrangler secret put APP_BASE_URL          # https://treow-clinic.duydichdanh.workers.dev
npx wrangler secret put SUPPORT_EMAIL
# email / payments as needed:
# npx wrangler secret put RESEND_API_KEY
# npx wrangler secret put EMAIL_FROM
npx wrangler secret put S3_BUCKET
npx wrangler secret put S3_ACCESS_KEY
npx wrangler secret put S3_SECRET_KEY
npx wrangler secret put S3_ENDPOINT
npx wrangler secret put S3_REGION

# Turnstile (public book / forgot-password). Site key is also needed at *build* time:
#   export NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x…
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Then delete the temporary bypass if present:
#   npx wrangler secret delete ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA

# Shared rate limits (multi-isolate). Without these, backend stays in-memory.
# Prefer a real Upstash Redis REST DB in an EU region. Until then, a
# Durable-Object Upstash-compatible shim Worker (`treow-rl-shim`) can be used:
#   UPSTASH_REDIS_REST_URL=https://treow-rl-shim.<subdomain>.workers.dev
#   UPSTASH_REDIS_REST_TOKEN=<shim TOKEN secret>
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```
Confirm `GET /api/v1/health` shows `"rateLimitBackend":"upstash"`.

Non-secret vars are in [`web/wrangler.jsonc`](../web/wrangler.jsonc) (`CLOUDFLARE_WORKERS`, `USE_NEON_ADAPTER`, `NODE_ENV`).

**Cron auth:** GitHub Actions secret `CRON_SECRET` must match the Worker secret `CRON_SECRET`. The workflow [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml) defaults a blank `APP_BASE_URL` to `https://treow-clinic.duydichdanh.workers.dev` and prints the host + clearer 401 hints.

## Deploy

```bash
cd web
npm ci
npm run deploy
```

This runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.

## Crons

Keep [`.github/workflows/cron-jobs.yml`](../.github/workflows/cron-jobs.yml) and set repo variable / secret `APP_BASE_URL` to the Workers URL (same paths + `CRON_SECRET` Bearer).

## Cutover from Vercel

1. Deploy Worker + secrets; confirm `/api/v1/health` and `/login`  
2. Point custom domain (optional) via Cloudflare dashboard → Workers → treow-clinic → Custom Domains  
3. Update `APP_BASE_URL` secret + GitHub cron base URL  
4. Pause or remove the Vercel production project when traffic is confirmed

## Local

```bash
npm run dev          # Next.js Node server
npm run preview      # OpenNext build + Workers runtime locally
```

R2 cache was not auto-wired because R2 must be enabled on the account first. After enabling, follow https://opennext.js.org/cloudflare/caching.
