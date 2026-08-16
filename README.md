# Treow Clinic

AI-first practice management for UK allied health (physio, osteopathy, manual therapy) — consultation recording that drafts clinical notes, plus friendly advanced booking.

**Launch defaults:** UK · GBP · mark-paid invoices · browser/PWA recording

## Docs

- [Product plan](docs/PRODUCT_PLAN.md) — vision, MVP, locked decisions
- [Architecture](docs/ARCHITECTURE.md) — stack, AI pipeline, UK compliance
- [Cliniko competitive research](docs/COMPETITIVE_CLINIKO.md) — how Treow improves on Cliniko

## Quick start

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo paths

| Path | What |
|------|------|
| `/` | Treow home |
| `/app` | Today (clinic) |
| `/app/visits/apt_1` | **AI visit demo** — consent → record → organised SOAP → sign |
| `/app/money` | Mark paid / unpaid invoices (GBP) |
| `/app/calendar` | Day calendar |
| `/book/northbank-manual` | Patient online booking |

AI organise uses a **mock** pipeline (`AI_PROVIDER=mock`) — no API keys required.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma schema (`web/prisma/schema.prisma`) — defaults `Europe/London`, `GBP`
- Brand config: `web/src/modules/config/brand.ts`

## Next build steps

1. Auth + multi-tenant clinics (UK defaults)
2. Postgres + real repositories
3. PWA + MediaRecorder upload + STT (UK/EU vendors)
4. LLM structured notes + sign/audit
5. Availability engine for online booking
6. UK GDPR compliance pack + beta mixed MSK clinics
