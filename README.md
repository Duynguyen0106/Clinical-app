# Treow Clinic

AI-first practice management for UK allied health (physio, osteopathy, manual therapy).

**Launch defaults:** UK · GBP · mark-paid invoices · browser/PWA recording

## Docs

- [Product plan](docs/PRODUCT_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Cliniko research](docs/COMPETITIVE_CLINIKO.md)
- [API reference](docs/API.md)
- [UK compliance](docs/UK_COMPLIANCE.md)
- [Launch readiness](docs/LAUNCH.md)
- [Deploy](docs/DEPLOY.md)
- [Website integration](docs/WEBSITE_INTEGRATION.md)
- [Phone checklist](docs/PHONE_CHECKLIST.md)
- [Pilot script](docs/PILOT.md)
- [Next steps](docs/NEXT_STEPS.md)

## Quick start

```bash
cd web
npm install
npx prisma db push
npm run db:seed
npm run dev
```

**Staff:** http://localhost:3000/login — `alex@northbank.example` / `treow-demo`  
**Patients:** http://localhost:3000/book/northbank-manual

### Clinic loop (MVP-1)

1. Sign in → Today shows live appointments  
2. Open visit → consent → record (device mic) → upload → organised draft → sign  
3. Money → mark invoice paid  
4. Public booking uses real availability slots  

PWA: installable via browser; service worker caches app shell.
