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

**Next product focus:** Design-partner **launch** — see `docs/LAUNCH.md` (merge RC, UK/EU host, DPAs, pilot 5 visits). Rooms/webhooks wait unless a partner asks.

### P1 status
- Week calendar + drag reschedule — done
- Email confirmation + reminder job — done (`EMAIL_PROVIDER=console|resend`)
- Online intake — done
- Suggest rebook from Plan — done

### P2 status
- Privacy notice (`/privacy`) + booking link — done
- Encrypted audio at rest + retention job — done
- Audit export + Settings UI — done
- RBAC polish on clinical / money / diary routes — done
- Vendor DPA checklist (docs) — done; signed DPAs remain an ops gate before live AI

### P3 status (partial)
- Waitlist auto-offer on cancel — done
- Task inbox — done
- Practice pulse (5 metrics) — done
- Rooms/resources — done (`Room` model, conflict checks, `/app/rooms`)
- SMS reminders — done (`SMS_PROVIDER=console|twilio`)
- Booking scenarios — staff book/block/fees/duration; patient manage links — done
- Webhooks — not started

### Launch readiness
- Checklist — `docs/LAUNCH.md`
- Deploy guide — `docs/DEPLOY.md`
- Health — `GET /api/v1/health`
- Production secret boot guard — `web/src/server/env.ts`
- Settings → Launch support — done
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

| # | Step | Why | Status |
|---|------|-----|--------|
| 11 | UK/EU hosting + encryption at rest for audio | Locked market | Done (local AES-GCM; UK/EU hosting ops) |
| 12 | Privacy notice, retention policy, audio delete job | UK GDPR | Done |
| 13 | Vendor DPAs (STT/LLM/storage) | Cannot beta with PHI otherwise | Checklist in `UK_COMPLIANCE.md` |
| 14 | Audit export for note access/sign | Clinical + ICO posture | Done |
| 15 | Role enforcement polish (reception vs practitioner) | Schema has roles; harden routes | Done |

**Exit criteria:** Legal/privacy review passes for unpaid UK beta (not full ISO yet).

---

### P3 — Beat Cliniko on ops (after loop works)

| Step | Cliniko gap addressed | Status |
|------|------------------------|--------|
| Waitlist auto-offer on cancel | Scheduling depth | Done |
| Task inbox (unsigned notes, unpaid, missing intake) | No native tasks | Done |
| Practice pulse (5 metrics) | Thin reporting | Done |
| Rooms/resources | Fake-practitioner workaround | Later |
| Webhooks | Integrator pain | Later |

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

**Next:** execute `docs/LAUNCH.md` — freeze RC, UK/EU staging, privacy/DPA checklist, Resend on, AI mock, then 5 pilot visits. Enable real STT/LLM only after signed AI DPA.
