# Clinical App (working name: Aether Clinic)

AI-first practice management inspired by Cliniko — with consultation recording that drafts clinical notes, plus a friendly advanced booking system.

## Docs

- [Product plan](docs/PRODUCT_PLAN.md) — vision, MVP, journeys, roadmap
- [Architecture](docs/ARCHITECTURE.md) — stack, AI pipeline, security

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
| `/` | Product home |
| `/app` | Today (clinic) |
| `/app/visits/apt_1` | **AI visit demo** — consent → record → organised SOAP note → sign |
| `/app/calendar` | Day calendar |
| `/book/harbour-physio` | Patient online booking |

The AI organise endpoint uses a **mock** transcript + note generator (`AI_PROVIDER=mock`). No API keys required for the demo.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma schema for clinic domain (`web/prisma/schema.prisma`)
- Modular folders under `web/src/modules/`

## Next build steps

1. Wire Postgres + auth (multi-tenant clinics)
2. Real MediaRecorder upload + STT vendor
3. LLM structured note generation with clinic templates
4. Availability engine for online booking
5. Compliance pack for your launch region

## Open decisions

See the bottom of `docs/PRODUCT_PLAN.md` (market, clinic type, billing depth, brand name).
