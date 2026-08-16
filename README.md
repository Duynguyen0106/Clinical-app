# Treow Clinic

AI-first practice management for UK allied health (physio, osteopathy, manual therapy) — consultation recording that drafts clinical notes, plus friendly advanced booking.

**Launch defaults:** UK · GBP · mark-paid invoices · browser/PWA recording

## Docs

- [Product plan](docs/PRODUCT_PLAN.md) — vision, MVP, locked decisions
- [Architecture](docs/ARCHITECTURE.md) — stack, AI pipeline, UK compliance
- [Cliniko competitive research](docs/COMPETITIVE_CLINIKO.md) — how Treow improves on Cliniko
- [API reference](docs/API.md) — backend v1 endpoints
- [Next steps analysis](docs/NEXT_STEPS.md) — prioritized product roadmap from current state

## Quick start

```bash
# Postgres running locally (see DATABASE_URL in web/.env.example)
cd web
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo login:** `alex@northbank.example` / `treow-demo`  
**Clinic slug:** `northbank-manual`

### Backend (done)

REST API under `/api/v1` with session auth:

- Auth, patients, appointments (conflict checks), clinic catalog
- Visits: consent → recording → mock STT/organise → draft note → sign
- Invoices: create + mark paid / unpaid (GBP)
- Public online booking by clinic slug

### Demo UI paths

| Path | What |
|------|------|
| `/` | Treow home |
| `/app` | Today (static demo UI — wire to API next) |
| `/app/visits/apt_1` | Visit UI prototype |
| `/book/northbank-manual` | Booking UI prototype |

## Next

1. Wire clinic UI to `/api/v1`
2. Real MediaRecorder upload + PWA
3. UK/EU STT + LLM providers (swap mock)
4. Waitlist / rebook / tasks from competitive plan
