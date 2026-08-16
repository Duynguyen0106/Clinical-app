# Treow Clinic — Next steps analysis

As of 2026-08-16. Assumes locked decisions (UK, mixed MSK, mark-paid, PWA) and shipped backend `/api/v1`.

---

## Where we are (updated)

| Layer | Status |
|-------|--------|
| REST API | Done |
| UI wired to API | Done (login, Today, calendar, patients, notes, money, visit, booking) |
| Real mic + upload | Done (MediaRecorder → local storage) |
| AI adapters | Done (`mock` default, `openai` optional) |
| Template-aware organise | Done |
| PWA shell | Done (manifest + SW) |

**Next product focus:** P1 booking polish (email reminders, intake) and UK compliance (P2).

---

## Product goal for the next milestone

> **Design partner ready:** a solo UK physio/osteo can book patients, run Visit mode on phone or laptop (real recording), review/sign a note, and mark an invoice paid — without leaving Treow.

Call this **MVP-1 (clinic loop)**. Everything else waits.

---

## Priority sequence

### P0 — Close the clinic loop (build next)

Without these, Treow is not a product — it’s a prototype.

| # | Step | Why now | Outcome |
|---|------|---------|---------|
| 1 | **Wire UI → API** | Demo screens still use fake data; sells nothing | Login, Today, Patients, Calendar, Money, Visit all hit `/api/v1` |
| 2 | **Real Visit recording** | Differentiator vs Cliniko; mock STT is not believable | MediaRecorder → upload chunks → store audio; stop triggers organise |
| 3 | **Replace mock AI with vendor adapters** | Need credible notes for beta clinics | STT + LLM adapters behind `AI_PROVIDER`; keep mock for CI |
| 4 | **PWA install + mic UX** | Locked mobile strategy | Add to home screen; permission copy; basic offline chunk queue |
| 5 | **Template-aware organise** | MSK pack exists in code but organise is SOAP-shaped only | Map AI output to selected physio/osteo/manual template |

**Exit criteria:** Design partner completes 5 real visits with signed AI drafts and mark-paid invoices.

---

### P1 — Make booking “Cliniko-calm” (needed to keep clinics)

Diary API exists; booking product does not yet feel finished.

| # | Step | Why | Notes |
|---|------|-----|-------|
| 6 | **Availability / next-slot engine** | Public book currently trusts client `startsAt` | Expand rules − appointments − buffers; return slots |
| 7 | **Week calendar + drag reschedule** | Core PMS expectation | Use existing PATCH reschedule |
| 8 | **Email confirmation + reminder** | No-shows kill trust | Resend/Postmark; SMS later |
| 9 | **Online intake (short)** | Reduces reception load | Name, contact, privacy + recording consent preference |
| 10 | **Suggest rebook from Plan** | Cliniko gap / Treow Tier B | After sign: one-tap follow-up slot |

**Exit criteria:** New patient books online → appears on Today → visit → signed note → invoice marked paid, with email trail.

---

### P2 — Trust & UK launch readiness (parallel to P0 late / P1)

| # | Step | Why |
|---|------|-----|
| 11 | UK/EU hosting + encryption at rest for audio | Locked market |
| 12 | Privacy notice, retention policy, audio delete job | UK GDPR |
| 13 | Vendor DPAs (STT/LLM/storage) | Cannot beta with PHI otherwise |
| 14 | Audit export for note access/sign | Clinical + ICO posture |
| 15 | Role enforcement polish (reception vs practitioner) | Schema has roles; harden routes |

**Exit criteria:** Legal/privacy review passes for unpaid UK beta (not full ISO yet).

---

### P3 — Beat Cliniko on ops (after loop works)

Do **not** start these before P0 exit criteria.

| Step | Cliniko gap addressed |
|------|------------------------|
| Waitlist auto-offer on cancel | Scheduling depth |
| Task inbox (unsigned notes, unpaid, missing intake) | No native tasks |
| Practice pulse (5 metrics) | Thin reporting |
| Rooms/resources | Fake-practitioner workaround |
| Webhooks | Integrator pain |

---

### Explicitly defer (avoid scope trap)

- Stripe / GoCardless / patient pay-online  
- Xero, Effra / insurer claiming  
- Body charts, telehealth, SMS  
- Native iOS/Android  
- Multi-site group reporting  
- Competing with Cliniko Connected Apps directory  
- NHS pathways / full EPR  

---

## Competitive pressure (affects ordering)

1. **Zanda already has native AI scribe** — Treow must ship a *better day-of Visit experience* (consent → record → template note → sign → rebook), not “also has AI.”  
2. **Cliniko + Heidi** is the default stack — win on **one login, one bill, MSK templates, UK calm UX**.  
3. Copying Cliniko feature-for-feature loses; **Visit loop + booking calm** wins early adopters.

---

## Suggested team focus (single track)

```
Week theme A:  UI↔API + login + Today/Calendar/Patients/Money
Week theme B:  Real recording + upload + STT/LLM adapters + Visit polish
Week theme C:  Availability slots + public booking + email
Week theme D:  UK privacy/retention + 1–2 design partner clinics
```

Then decide P3 ops features from partner feedback (not from competitor feature lists alone).

---

## Success metrics for MVP-1

Reuse product plan targets, measured on design partners:

- Median visit-end → signed note **&lt; 3 minutes**  
- **&gt; 70%** of visits use AI draft path after week 2  
- Practitioner would “miss Treow” vs Cliniko for documentation  
- Zero recording-without-consent events  
- Zero critical privacy incidents  

---

## Immediate recommendation

**Next build:** wire the existing UI to `/api/v1` and replace Visit mock recording with real MediaRecorder + upload — that unlocks everything else and is the shortest path to a demo that sells against Cliniko.
