# Treow Clinic — Launch readiness

Goal: **unpaid UK design-partner beta** (1–2 clinics), not full commercial GA.

Product loop already ships: book → Today → Visit (record) → sign note → mark paid · waitlist · tasks · pulse · UK privacy controls.

---

## Phase A — Freeze the MVP (engineering)

- [ ] Merge open PRs that belong in launch (`product plan`, ops P3, brand UI)
- [ ] Replace generated logo with **final brand assets** in `web/public/brand/`
- [ ] Tag a release candidate (e.g. `v0.1.0-rc1`)
- [ ] Confirm `npm run build` + seed + smoke path on RC
- [ ] `GET /api/v1/health` returns `ok` on production URL

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

**Exit:** Written OK to process pilot patient data; AI stays mock until LLM DPA signed.

---

## Phase C — Production environment

See `docs/DEPLOY.md`. Minimum:

| Item | Target |
|------|--------|
| Region | UK/EU (`eu-west-2` / `lhr` / EU Postgres) |
| App | HTTPS Next.js host |
| DB | Managed Postgres + daily backups |
| Email | `EMAIL_PROVIDER=resend` + verified domain |
| AI | `AI_PROVIDER=mock` until DPA; then `openai` (or EU vendor) |
| Cron | Hit `/api/v1/jobs/reminders` (email+SMS) and `/api/v1/jobs/retention` daily |
| Env | `APP_BASE_URL`, `NODE_ENV=production` |
| SMS | `SMS_PROVIDER=console` or `twilio` + Twilio creds |

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
5. Export note audits once from Settings
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
| Staff lockout | Owner resets via DB/support; add password-reset later |
| Audit export | Settings → Export note audits |
| Purge audio | Settings → Run retention (owner) |
| Incident | Email `SUPPORT_EMAIL` (env) + clinic owner |
| Privacy request | Clinic (controller) handles; Treow assists as processor |

- [ ] Set `SUPPORT_EMAIL` in production
- [ ] Agree 1-working-day response for pilot incidents

---

## Explicitly **not** required for this launch

- Rooms/resources, webhooks  
- Stripe / SMS / telehealth / Xero / body charts  
- Native apps, NHS DSPT, ISO 27001  
- Public marketing site beyond the in-app home page  

---

## Suggested order this week

```
1. Merge RC + final logo
2. Provision UK/EU staging (Phase C)
3. Complete Phase B checklist with clinic adviser
4. Turn on Resend; keep AI mock
5. Pilot 5 visits (Phase D)
6. Only then enable real STT/LLM under signed DPA
```
