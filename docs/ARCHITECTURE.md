# Technical Architecture

## Stack (recommended)

| Layer | Choice | Why |
|-------|--------|-----|
| App | **Next.js** (App Router) + TypeScript | One codebase for clinic app + booking pages; server actions / API routes |
| UI | Tailwind + accessible primitives (e.g. Radix) | Fast, calm UI without heavy design system debt |
| Auth | Clerk or Auth.js + org memberships | Multi-tenant clinics, roles |
| DB | **PostgreSQL** + Prisma | Relational clinical data, strong constraints |
| Object storage | S3-compatible (R2 / S3) | Audio blobs, attachments |
| Queue / jobs | Inngest or BullMQ | Transcription + note generation async |
| STT | Deepgram / AssemblyAI / Whisper API | Streaming + batch; medical vocab where available |
| LLM | OpenAI / Anthropic (structured outputs) | Note structuring from transcript + template |
| Email | Resend / Postmark | Confirmations, reminders |
| Hosting | Vercel + managed Postgres (or Fly + Neon) | Fast iteration |

> Compliance note: final STT/LLM vendors must support BAA / DPA and data residency for your launch region. Architecture assumes a **vendor adapter** so providers can be swapped.

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
- Auth session resolves membership → role → RLS-style checks in app layer (Postgres RLS optional later).
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

## Security & compliance checklist

- [ ] TLS everywhere; encrypt audio at rest (KMS)
- [ ] Separate storage paths per clinic; signed URLs short-lived
- [ ] RBAC on every PHI endpoint
- [ ] Audit: who viewed/edited/signed notes and recordings
- [ ] Retention jobs (delete audio after N days if configured)
- [ ] Consent artefacts stored with timestamp + method
- [ ] Vendor BAAs; no training on customer data without opt-in
- [ ] Export / delete patient (right of access / erasure where applicable)
- [ ] Penetration test before paid launch

---

## API surface (MVP)

| Area | Examples |
|------|----------|
| Auth / clinic | session, members, settings |
| Patients | CRUD, search, timeline |
| Scheduling | calendar feed, create/reschedule, availability, public book |
| Visits | start, consent, upload URL, stop, status |
| Notes | get draft, patch, sign, list needing signature |
| Billing | create invoice, mark paid |

Prefer Server Actions for clinic UI; public booking via Route Handlers.

---

## Local / cloud agent development

- `pnpm install && pnpm dev`
- Postgres via Docker or Neon
- Mock STT/LLM adapters for UI work without API keys (`AI_PROVIDER=mock`)
