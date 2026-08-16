# Technical Architecture — Treow Clinic

**Launch defaults:** UK · `Europe/London` · `GBP` · PWA recording · mark-paid billing only

## Stack (recommended)

| Layer | Choice | Why |
|-------|--------|-----|
| App | **Next.js** (App Router) + TypeScript + PWA | Clinic app + booking + installable phone recording |
| UI | Tailwind + accessible primitives (e.g. Radix) | Fast, calm UI without heavy design system debt |
| Auth | Clerk or Auth.js + org memberships | Multi-tenant clinics, roles |
| DB | **PostgreSQL** + Prisma | Relational clinical data, strong constraints |
| Object storage | S3-compatible with **UK/EU region** (e.g. R2 EU, AWS london) | Audio blobs, attachments; residency |
| Queue / jobs | Inngest or BullMQ | Transcription + note generation async |
| STT | Deepgram / AssemblyAI / Whisper API (UK/EU-capable) | Streaming + batch; medical vocab where available |
| LLM | OpenAI / Anthropic (structured outputs) with DPA | Note structuring from transcript + template |
| Email | Resend / Postmark | Confirmations, reminders |
| Hosting | Prefer UK/EU region (Vercel + Neon EU, or Fly `lhr`/`ams`) | UK GDPR posture |

> Compliance note: STT/LLM/storage vendors must support a **UK GDPR DPA** and acceptable data residency. Architecture uses a **vendor adapter** so providers can be swapped.

---

## High-level system

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Clinic web app  │     │ Patient booking  │     │ Background jobs │
│ (Today/Visit)   │     │ (public pages)   │     │ STT + LLM notes │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         └───────────┬───────────┴────────────┬───────────┘
                     ▼                        ▼
              PostgreSQL                 Object storage
           (tenants, PHI)              (audio, files)
```

---

## Multi-tenancy

- Every clinical row carries `clinicId`.
- Auth session resolves membership → role → **app-layer** `clinicId` filters on every query (primary defence).
- **Postgres RLS** (optional hardening): `web/prisma/sql/001_clinic_rls.sql` enables policies on Patient, Appointment, WaitlistEntry, Invoice, PatientAccessEvent, NoteTemplate, AiOrganiseJob. Apply with `npm run db:rls`.
- Use `withClinicTransaction(clinicId, fn)` / `SET LOCAL app.clinic_id` so pooled connections never leak tenant context (`src/server/clinic-rls.ts`).
- Production hardening path: non-owner DB role + `FORCE ROW LEVEL SECURITY` + always set clinic GUC (or `app.rls_bypass=on` only for seed/cron). Until FORCE is on, the table-owner role bypasses RLS (Postgres default).
- Patient booking pages scoped by clinic slug / public booking token.

---

## Domain modules

```
src/
  modules/
    clinics/       # tenant, locations, hours, roles
    patients/      # demographics, consents, files
    scheduling/    # appointments, availability, waitlist, online booking
    visits/        # visit session, recording consent, status
    notes/         # templates, drafts, signed notes, audit
    ai/            # STT adapter, LLM note organiser, prompts
    billing/       # invoices, payments
    notifications/ # email/SMS jobs
```

---

## AI consultation pipeline

```
1. Practitioner starts Visit → consent recorded
2. Browser MediaRecorder (or streaming WS) → chunked upload to storage
3. Job: Transcribe audio → transcript (speaker labels if available)
4. Job: Load note template + patient context (prior notes summary, chief complaint)
5. LLM returns structured JSON matching template schema
6. Create Note draft (status: draft, source: ai)
7. Practitioner edits → Sign → status: signed, immutable snapshot + hash
```

### Template schema (example SOAP)

```json
{
  "sections": [
    { "id": "subjective", "title": "Subjective", "type": "markdown" },
    { "id": "objective", "title": "Objective", "type": "markdown" },
    { "id": "assessment", "title": "Assessment", "type": "markdown" },
    { "id": "plan", "title": "Plan", "type": "markdown" }
  ]
}
```

LLM must fill only these fields; unknown content goes to `clinician_review_flags[]`.

### Safety rules in prompts / post-process

- Do not invent vitals, diagnoses, or meds not present in transcript.
- Prefer “Not discussed” over fabrication.
- Flag contradictions with prior signed notes for human review.
- Always label UI: “AI draft — not part of the record until signed”.

---

## Scheduling model (friendly + advanced)

**Entities**
- `AppointmentType` — duration, buffers, colour, online-bookable
- `AvailabilityRule` — weekly hours + exceptions (leave, blocked)
- `Appointment` — patient, practitioner, location, status, recurrence group
- `WaitlistEntry` — preferred windows, service, auto-notify flag

**Smart behaviours (MVP → phase 2)**
- MVP: conflict checks, buffers, next-available search, waitlist manual fill
- Phase 2: auto-offer cancelled slots, suggest follow-up from note Plan section, no-show risk score

**Online booking algorithm (MVP)**
1. Filter practitioners who offer selected appointment type  
2. Expand availability rules − existing appointments − buffers − blackouts  
3. Return first N slots; optional “earliest overall” across practitioners  

---

## Data model (core tables)

See `prisma/schema.prisma` for the living schema. Conceptual entities:

- `Clinic`, `Location`, `Membership` (user ↔ clinic + role)
- `PractitionerProfile`
- `Patient`, `PatientConsent`
- `AppointmentType`, `AvailabilityRule`, `AvailabilityException`
- `Appointment`, `WaitlistEntry`
- `Visit`, `Recording`, `Transcript`
- `NoteTemplate`, `ClinicalNote` (draft | signed), `NoteAuditEvent`
- `Invoice`, `Payment`

---

## Billing (MVP)

- Invoices in **GBP**; staff **mark paid / unpaid** (cash, card terminal, bank transfer — method noted, not processed in-app).
- No Stripe/GoCardless in MVP.
- `Payment` rows record manual settlements only.

## PWA recording

- `MediaRecorder` in Visit mode on desktop and mobile Safari/Chrome.
- Service worker caches app shell; audio chunks queue locally then upload.
- Mic permission copy and consent gate before any capture.

## Security & compliance checklist (UK)

- [ ] TLS everywhere; encrypt audio at rest (KMS)
- [ ] UK/EU storage paths per clinic; short-lived signed URLs
- [ ] RBAC on every patient-data endpoint
- [ ] Audit: who viewed/edited/signed notes and recordings
- [ ] Retention jobs (delete audio after N days if configured)
- [ ] Consent artefacts stored with timestamp + method
- [ ] Vendor **DPAs**; no training on customer data without opt-in
- [ ] SAR / erasure support (UK GDPR rights)
- [ ] Privacy notice + record of processing for Treow Clinic
- [ ] Penetration test before paid UK launch

---

## API surface (MVP)

| Area | Examples |
|------|----------|
| Auth / clinic | session, members, settings (timezone London, GBP) |
| Patients | CRUD, search, timeline |
| Scheduling | calendar feed, create/reschedule, availability, public book |
| Visits | start, consent, upload URL, stop, status |
| Notes | get draft, patch, sign, list needing signature |
| Billing | create invoice, **mark paid**, PDF receipt |

Prefer Server Actions for clinic UI; public booking via Route Handlers.

---

## Local / cloud agent development

- `npm install && npm run dev` (from `web/`)
- Postgres via Docker or Neon (EU region when cloud)
- Mock STT/LLM adapters for UI work without API keys (`AI_PROVIDER=mock`)
