# Clinical App — Product Plan

Working name: **Aether Clinic** (placeholder — rename anytime)

An AI-first practice management platform for allied health and outpatient clinics. Cliniko-class scheduling, records, and billing — with consultation recording that drafts clinical notes so practitioners do not need to type during or after the visit.

---

## Problem

Clinicians lose time to documentation and admin. Existing tools (Cliniko, Jane, Power Diary) are strong at calendar + templates, but notes still require typing. Booking works, but rarely helps fill gaps, recover no-shows, or guide patients through intake without staff effort.

## Vision

> Start the visit → tap Record → finish care → review a structured note → sign.

Booking, patients, invoices, and reminders stay simple and calm. AI handles the heavy lifting on notes and operational decisions — always with practitioner approval before anything becomes the clinical record.

---

## Who it is for (first market)

**Primary:** Physiotherapy, chiropractic, osteopathy, massage, psychology / counselling, OT — solo and small multi-practitioner clinics (1–25 practitioners).

**Secondary (later):** Multi-site groups, medical specialists with outpatient consults.

**Not first:** Acute hospital EMR, inpatient wards, complex inpatient billing.

---

## Core differentiators vs Cliniko

| Area | Cliniko-like baseline | Our advance |
|------|----------------------|-------------|
| Clinical notes | Templates, drafts, body charts | **Record → transcript → structured note** (SOAP / custom) with one-tap approve |
| Booking | Calendar, online booking, reminders | **Smart availability**, waitlist auto-fill, no-show risk, suggested rebooks |
| Day-of workflow | Appointment list | **Visit mode**: patient context + record + note review in one surface |
| AI | Limited / none | Note drafting, coding suggestions, follow-up message drafts — **human signs off** |
| UX | Clean and simple | Keep that simplicity; hide complexity behind progressive disclosure |

---

## Product principles

1. **Practitioner never writes from a blank page** for routine visits — AI drafts; human edits and signs.
2. **Friendly > feature-dense** — one primary action per screen; advanced tools behind clear entry points.
3. **Clinical record is sacred** — AI output is draft until signed; full audit trail.
4. **Consent first** — recording requires explicit patient consent captured in the visit flow.
5. **Offline-tolerant recording** — audio buffers locally if network drops; uploads when stable.
6. **Clinic owns the data** — export, retention policies, region-aware hosting.

---

## MVP (ship first)

### 1. Clinic foundation
- Multi-tenant clinic account
- Roles: Owner, Practitioner, Reception, Read-only
- Practitioners, locations, business hours, appointment types (duration, buffer, colour)

### 2. Patients
- Patient profile (demographics, contacts, consents, alerts)
- Timeline: appointments, notes, invoices, files
- Basic intake form (online) before first visit

### 3. Booking (advanced but friendly)
- Day / week calendar (drag reschedule)
- Online booking page (embed or share link)
- Recurring appointments
- Waitlist with one-click offer of freed slots
- Email reminders (SMS later)
- Conflict prevention and buffer times
- “Suggest next slot” for follow-ups based on type + practitioner preference

### 4. AI consultation notes (hero feature)
- Visit mode: open appointment → **Record consultation**
- Capture consent before recording
- Speech-to-text (streaming when possible)
- After stop: generate structured note from clinic template (default SOAP)
- Practitioner reviews, edits, **signs** → locked clinical note
- Raw audio + transcript retained per retention policy (configurable; default limited retention)

### 5. Light billing
- Invoice from appointment
- Mark paid / unpaid
- Basic PDF receipt (payment gateway later)

### 6. Trust & compliance (MVP bar)
- Consent records for recording
- Role-based access
- Audit log for note create / edit / sign / access
- Encryption in transit; encrypted storage for audio/transcripts
- Clear “AI-assisted draft” labelling until signed

---

## Out of MVP (phase 2+)

- SMS reminders, two-way messaging
- Telehealth video + record telehealth audio
- Body charts / image annotation on notes
- Insurance / Medicare / NDIS billing packs by region
- AI coding (ICD / local schemes) with practitioner confirm
- No-show prediction and overbooking suggestions
- Inventory / retail
- Accounting sync (Xero / QuickBooks)
- Multi-clinic group reporting
- Mobile native apps (MVP is responsive web + PWA recording)

---

## Key user journeys

### A. Practitioner — AI note visit
1. Opens today’s calendar → selects patient appointment.
2. Confirms / captures recording consent.
3. Taps **Start recording**, conducts visit hands-free.
4. Taps **Stop** → sees “Organising note…”.
5. Reviews SOAP (or custom) draft, light edits, **Sign**.
6. Optionally taps **Suggest follow-up** → books next appointment in two taps.

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
- Money (invoices)
- Settings

**Patient-facing**
- Book
- My appointments
- Forms
- Invoices (later)

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
| Jurisdiction regulation (privacy, health records) | Region selection at signup; legal review before launch markets |
| STT quality (accents, noisy rooms) | Good mics guidance; edit UI excellent; optional dictation correction |
| Scope creep to full EMR | Ruthless MVP; allied-health outpatient first |
| Trust / “AI replacing clinicians” | Position as scribe, not decision-maker |

---

## Suggested build order

1. Auth + clinic + practitioners + patients  
2. Calendar + appointments + online booking  
3. Visit mode + recording + STT pipeline  
4. Note generation + review + sign + audit  
5. Invoices + reminders  
6. Waitlist + smart suggest slot  
7. Hardening, compliance pack, beta clinics  

---

## Open decisions (for you)

1. **Primary country / regulation** first? (AU / UK / NZ / US / VN / other)  
2. **Clinic type** for beta? (physio vs psychology vs mixed)  
3. **Brand name** preference?  
4. **Must-have billing** in MVP (simple cash/card mark-paid vs payment gateway)?  
5. **Mobile**: is phone recording in browser enough for v1, or need native?  
