# Treow Clinic — Product Plan

**Brand:** Treow Clinic  
**Launch market:** United Kingdom  
**Primary vertical:** Mixed allied health — physiotherapy, osteopathy, manual therapy (and similar MSK / hands-on practices)  
**MVP billing:** Invoice + mark paid / unpaid only (no payment gateway)  
**Mobile v1:** Responsive web + PWA (browser recording; no native app yet)

An AI-first practice management platform for UK allied health clinics. Cliniko-class scheduling, records, and simple billing — with consultation recording that drafts clinical notes so practitioners do not need to type during or after the visit.

---

## Problem

Clinicians lose time to documentation and admin. Existing tools (Cliniko, Jane, Power Diary) are strong at calendar + templates, but notes still require typing. Booking works, but rarely helps fill gaps, recover no-shows, or guide patients through intake without staff effort.

## Vision

> Start the visit → tap Record → finish care → review a structured note → sign.

Booking, patients, invoices, and reminders stay simple and calm. AI handles the heavy lifting on notes and operational decisions — always with practitioner approval before anything becomes the clinical record.

---

## Who it is for (first market)

**Primary (UK):** Physiotherapy, osteopathy, manual therapy, sports massage / soft-tissue, chiropractic-adjacent MSK — solo and small multi-practitioner clinics (1–25 practitioners), including mixed-discipline clinics under one roof.

**Secondary (later):** Multi-site groups; other UK outpatient allied health; additional countries after UK compliance pack is proven.

**Not first:** Acute hospital EPR, inpatient wards, NHS secondary-care systems, complex insurer claim engines.

---

## Locked product decisions

| Decision | Choice |
|----------|--------|
| Country / regulation | **UK** — UK GDPR, Data Protection Act 2018, ICO expectations; UK data residency preferred for PHI/audio |
| Clinic mix | **Physio + osteo + manual therapy** (shared MSK workflows, SOAP-friendly notes) |
| Brand | **Treow Clinic** |
| MVP money | **Mark paid only** — create invoice, mark paid/unpaid, basic PDF receipt |
| Mobile recording | **Browser / PWA** — MediaRecorder on phone & desktop; installable PWA; native apps deferred |

---

## How Treow improves on Cliniko

Full research: [COMPETITIVE_CLINIKO.md](./COMPETITIVE_CLINIKO.md).

**Cliniko’s moat:** calm UX, solid calendar/booking, trusted allied-health brand. **Cliniko’s gap:** no native AI scribe (Heidi etc. are extra apps), thin reporting, no tasks, few default note templates, weak rooms/resources, poll-only API.

**Treow must-win:**
1. Native **Visit mode** (record → organised note → sign) — no second AI subscription  
2. **MSK template pack** for mixed physio / osteo / manual therapy  
3. Stay **as friendly as Cliniko** (no feature clutter)  
4. UK defaults (London, GBP, UK GDPR)  
5. Next: waitlist fill, rebook-from-Plan, lightweight tasks, practice pulse metrics  

Do not try to out-ecosystem Cliniko’s Connected Apps in year one — out-execute the day-of clinical workflow instead.

---

## Core differentiators vs Cliniko

| Area | Cliniko-like baseline | Treow advance |
|------|----------------------|---------------|
| Clinical notes | Templates, drafts, body charts | **Record → transcript → structured note** (SOAP / custom) with one-tap approve |
| Booking | Calendar, online booking, reminders | **Smart availability**, waitlist auto-fill, suggested rebooks |
| Day-of workflow | Appointment list | **Visit mode**: patient context + record + note review in one surface |
| AI | Limited / none | Note drafting, follow-up message drafts — **human signs off** |
| UX | Clean and simple | Keep that simplicity; hide complexity behind progressive disclosure |

---

## Product principles

1. **Practitioner never writes from a blank page** for routine visits — AI drafts; human edits and signs.
2. **Friendly > feature-dense** — one primary action per screen; advanced tools behind clear entry points.
3. **Clinical record is sacred** — AI output is draft until signed; full audit trail.
4. **Consent first** — recording requires explicit patient consent captured in the visit flow (UK transparency + lawful basis).
5. **Offline-tolerant recording** — audio buffers locally if network drops; uploads when stable (critical for PWA).
6. **Clinic owns the data** — export, retention policies, **UK-region hosting**.

---

## MVP (ship first)

### 1. Clinic foundation
- Multi-tenant clinic account (default timezone `Europe/London`, currency `GBP`)
- Roles: Owner, Practitioner, Reception, Read-only
- Practitioners, locations, business hours
- Appointment types suited to mixed MSK clinics (e.g. Initial assessment, Follow-up, Manual therapy, Osteopathy session)

### 2. Patients
- Patient profile (demographics, contacts, consents, alerts)
- Timeline: appointments, notes, invoices, files
- Basic intake form (online) before first visit
- Recording consent artefact on file

### 3. Booking (advanced but friendly)
- Day / week calendar (drag reschedule)
- Online booking page (embed or share link)
- Recurring appointments
- Waitlist with one-click offer of freed slots
- Email reminders (SMS later — UK sender ID / compliance later)
- Conflict prevention and buffer times
- “Suggest next slot” for follow-ups

### 4. AI consultation notes (hero feature)
- Visit mode: open appointment → **Record consultation** (desktop or phone browser / PWA)
- Capture consent before recording
- Speech-to-text (streaming when possible)
- After stop: generate structured note from clinic template (default SOAP)
- Practitioner reviews, edits, **signs** → locked clinical note
- Raw audio + transcript retained per UK retention policy (configurable; default limited retention for audio)

### 5. Light billing (mark paid only)
- Invoice from appointment (GBP)
- Status: draft / sent / **paid** / void — staff mark paid manually
- Basic PDF receipt
- **No** card gateway, Stripe, or patient pay-online in MVP

### 6. Trust & compliance (UK MVP bar)
- Consent records for recording
- Role-based access
- Audit log for note create / edit / sign / access
- Encryption in transit; encrypted storage for audio/transcripts
- Clear “AI-assisted draft” labelling until signed
- Privacy notice / processing records oriented to UK GDPR
- Prefer UK/EU vendors (or UK data residency) for STT/LLM/storage with DPA

### 7. PWA
- Installable web app
- Visit recording usable on practitioner phone in clinic
- Basic offline buffer for audio chunks

---

## Out of MVP (phase 2+)

- SMS reminders, two-way messaging
- Telehealth video + record telehealth audio
- Body charts / image annotation on notes
- Private medical insurance / invoice packs; NHS pathways if ever relevant
- AI coding suggestions with practitioner confirm
- No-show prediction and overbooking suggestions
- Inventory / retail
- Accounting sync (Xero — strong UK fit)
- Multi-clinic group reporting
- Online card payments
- Native iOS / Android apps

---

## Key user journeys

### A. Practitioner — AI note visit
1. Opens today’s calendar → selects patient appointment.
2. Confirms / captures recording consent.
3. Taps **Start recording** (laptop or phone PWA), conducts visit hands-free.
4. Taps **Stop** → sees “Organising note…”.
5. Reviews SOAP (or custom) draft, light edits, **Sign**.
6. Optionally taps **Suggest follow-up** → books next appointment in two taps.
7. Reception (or practitioner) creates invoice and **marks paid** when settled.

### B. Reception — busy Monday
1. Sees day view with gaps and waitlist badges.
2. Cancellation frees a slot → waitlist patient gets offer (or staff fills manually).
3. New patient books online → appears with incomplete intake flagged.
4. Checks in patient → practitioner sees them in Visit mode.

### C. Patient — online book
1. Opens clinic link → picks service + practitioner (or “first available”).
2. Completes short intake + consents.
3. Gets confirmation + reminder; can reschedule within policy.

---

## Information architecture (app nav)

**Practitioner / clinic app**
- Today
- Calendar
- Patients
- Notes (inbox of drafts to sign)
- Money (invoices — mark paid)
- Settings

**Patient-facing**
- Book
- My appointments
- Forms
- Invoices (view / pay-online later)

---

## Success metrics (MVP)

- Median time from visit end → signed note **&lt; 3 minutes**
- % of visits with AI-assisted signed notes **&gt; 70%** after week 2
- Online bookings as % of new appointments **&gt; 40%**
- Practitioner NPS / “would miss this” qualitative feedback
- Zero critical privacy incidents

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| AI hallucinates clinical content | Draft-only; require sign; show transcript link; confidence / “needs review” flags |
| Recording without consent | Hard gate before Record; audit consent |
| UK privacy / clinical record expectations | UK GDPR pack; DPAs; retention; ICO-minded privacy notice; legal review before paid launch |
| STT quality (accents, noisy rooms) | Good mics guidance; excellent edit UI; PWA mic permissions UX |
| Scope creep to full EPR | Ruthless MVP; UK outpatient MSK first |
| Trust / “AI replacing clinicians” | Position as scribe, not decision-maker |

---

## Suggested build order

1. Auth + clinic + practitioners + patients (UK defaults)  
2. Calendar + appointments + online booking  
3. Visit mode + PWA recording + STT pipeline  
4. Note generation + review + sign + audit  
5. Invoices + **mark paid** + email reminders  
6. Waitlist + smart suggest slot  
7. UK compliance hardening + beta mixed MSK clinics  

---

## Decisions log

| # | Question | Answer | Date |
|---|----------|--------|------|
| 1 | Primary country | UK | 2026-08-16 |
| 2 | Clinic type | Mixed physio, osteo, manual therapy | 2026-08-16 |
| 3 | Brand | Treow Clinic | 2026-08-16 |
| 4 | MVP billing | Mark paid only | 2026-08-16 |
| 5 | Mobile v1 | Browser / PWA recording | 2026-08-16 |
