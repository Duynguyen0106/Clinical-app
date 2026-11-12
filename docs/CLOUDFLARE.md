# Cloudflare Workers deploy (OpenNext)

Treow Clinic runs on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

Production Worker name: `treow-clinic`  
Live URL: **https://treow-clinic.duydichdanh.workers.dev**

Prisma client is generated with `runtime = "cloudflare"` so Workers do not compile query-compiler WASM at runtime.

## Prerequisites

1. Cloudflare account API token with Workers Scripts Edit + Account read  
2. **Neon** `DATABASE_URL` (Europe) — Workers cannot use TCP `pg` pools; the app uses `@prisma/adapter-neon` automatically for `neon.tech` URLs and when `CLOUDFLARE_WORKERS=1`  
3. **Enable R2** in the Cloudflare dashboard (Account → R2), then create:
   - `treow-clinic-cache` — OpenNext incremental cache (optional but recommended)
   - `treow-clinic-media` — encrypted visit audio (S3-compatible)
4. R2 API token → set as `S3_ACCESS_KEY` / `S3_SECRET_KEY` with:
   - `S3_BUCKET=treow-clinic-media`
   - `S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`

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
```

Non-secret vars are in [`web/wrangler.jsonc`](../web/wrangler.jsonc) (`CLOUDFLARE_WORKERS`, `USE_NEON_ADAPTER`, `NODE_ENV`).

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
