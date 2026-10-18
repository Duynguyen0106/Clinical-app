# Treow Clinic — Launch readiness

Goal: sell **Treow Clinic** as a full UK clinic management system (diary, booking, notes, money, team).

Commercial packaging: see **`docs/SELL.md`**.

Product loop: website booking → diary → visit notes → invoices · rooms · waitlist · team.

---

## Phase A — Freeze the MVP (engineering)

Merge the draft tip stack **in order** (each PR stacks on the previous):

1. #63 clinical-safety-ci → `main`
2. #64 leak-live-day
3. #65 re-audit-improve
4. #66 post-65-harden
5. #67 leak-diary-scope
6. #68 money-desk-scope
7. #69 patient-email-automation
8. #70 patient-email-harden
9. #71 booking-ics-confirm
10. #72 desk-privacy-sync
11. #73 reminders-opt-in (advance reminders default off — merge with tip)

Then:

- [ ] Apply migrations through `20261018_appointment_reminders_opt_in`
- [ ] Wire external/Pro cron: hourly `/jobs/reminders` + `/jobs/patient-emails`; 5m `/jobs/organise` (Hobby `vercel.json` only runs daily retention)
- [ ] Replace generated logo with **final brand assets** in `web/public/brand/` (optional for pilot)
- [ ] Tag a release candidate (e.g. `v0.1.0-rc1`)
- [ ] Confirm `npm run build` + seed + smoke path on RC
- [ ] `GET /api/v1/health` returns `ok` with `cronConfigured`, `emailProvider`, `smsProvider`
- [ ] Clinic Settings: keep deposits OFF; enable reminders / thank-you / review only when ready; INITIALS if open desk

**Exit:** One deployable commit the pilot clinics will run.

---

## Phase B — Trust gates (ops / legal) — **blocks live PHI + real AI**

From `docs/UK_COMPLIANCE.md`:

- [ ] Clinic reviews `/privacy` with their adviser (controller wording)
- [ ] Recording consent UX reviewed (visit + booking preference)
- [ ] Signed **DPAs** for each live sub-processor:
  - [ ] Hosting / Postgres (UK or EU region)
  - [ ] Object storage for audio (UK/EU) — or keep encrypted local only for tiny beta
  - [ ] Email (e.g. Resend)
  - [ ] STT / LLM (only when leaving `AI_PROVIDER=mock`)
- [ ] Sub-processor list written into clinic RoPA / processing record
- [ ] Retention days set in **Settings** (default 14)
- [ ] Strong secrets: `AUTH_SECRET`, dedicated `AUDIO_ENCRYPTION_KEY` (not the demo values)
- [ ] Turnstile keys set for public book + forgot-password

**Exit:** Written OK to process pilot patient data; AI stays mock until LLM DPA signed.

---

## Phase C — Production environment

See `docs/DEPLOY.md` (including §3b live ship checklist). Minimum:

| Item | Target |
|------|--------|
| Region | UK/EU (`eu-west-2` / `lhr` / EU Postgres) |
| App | HTTPS Next.js host |
| DB | Managed Postgres + daily backups |
| Email | `EMAIL_PROVIDER=resend` + verified domain |
| AI | `AI_PROVIDER=mock` until DPA; then `openai` (or EU vendor) |
| Cron | External or Pro: hourly `/api/v1/jobs/reminders` + `/api/v1/jobs/patient-emails`, every 5m `/api/v1/jobs/organise`; daily retention in `vercel.json` |
| Env | `APP_BASE_URL`, `NODE_ENV=production`, `CRON_SECRET` (≥24) |
| SMS | `SMS_PROVIDER=console` (honest UI) or `twilio` + Twilio creds |
| Abuse | Optional `UPSTASH_REDIS_REST_*` for shared rate limits |

- [ ] Staging URL for internal QA
- [ ] Production URL for pilot clinic only (no public marketing push)
- [ ] Health check monitored (uptime ping on `/api/v1/health`)

**Exit:** Pilot clinic can log in on the production URL.

---

## Phase D — Design-partner pilot

1. Onboard clinic owner + reception accounts (no shared passwords)
2. Import or create ~10 patients; book a week of appointments
3. Run **5 real visits** with recording → organised draft → sign
4. Mark invoices paid; cancel one slot to prove waitlist offer
5. Export note audits once from Settings (owner / practitioner)
6. Capture metrics:
   - Median visit-end → signed note
   - % visits using AI draft path
   - Any recording-without-consent events (**must be zero**)
   - Privacy incidents (**must be zero**)

**Exit:** Partner would “miss Treow” for documentation vs Cliniko+Heidi for the day-of loop.

---

## Phase E — Support pack (before day 1)

Documented in Settings → **Launch support** and below:

| Need | How |
|------|-----|
| Staff lockout | Owner sets temporary password on Team (revokes sessions); staff may also use forgot-password email |
| Audit export | Settings → Export access audits (owner / practitioner) |
| Purge audio | Settings → Run retention (owner) |
| Incident | Email `SUPPORT_EMAIL` (env) + clinic owner |
| Privacy request | Clinic (controller) handles; Treow assists as processor |

- [ ] Set `SUPPORT_EMAIL` in production
- [ ] Agree 1-working-day response for pilot incidents

---

## Explicitly **not** required for this launch

- Rooms/resources, webhooks  
- Stripe packs beyond deposits / SMS / telehealth / Xero / body charts  
- Native apps, NHS DSPT, ISO 27001  
- Public marketing site beyond the in-app home page  

---

## Suggested order this week

```
1. Merge RC + final logo
2. Provision UK/EU staging (Phase C) + wire reminders/organise cron
3. Complete Phase B checklist with clinic adviser
4. Turn on Resend + Turnstile; keep AI mock
5. Pilot 5 visits (Phase D)
6. Only then enable real STT/LLM under signed DPA
```
