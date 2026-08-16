# Cliniko competitive research → Treow advantages

Research date: 2026-08-16  
Sources: Cliniko marketing/features, third-party reviews (Pabau, Medesk, Wisevu, NewFrame), competitor comparisons (Zanda/Power Diary, Jane), Cliniko AI ecosystem write-ups, Heidi/Effra integration pages.

---

## What Cliniko is (and why clinics love it)

Cliniko is the **default “clean & reliable” PMS** for allied health (physio, osteo, chiro, massage, psych, OT) — especially strong in **AU / UK / NZ**.

| Strength | Implication for Treow |
|----------|------------------------|
| Extremely clear calendar & online booking | Must match or feel *at least as calm* — do not win by adding clutter |
| Customisable treatment notes + body charts | Templates still matter; AI drafts must map into templates |
| Transparent per-practitioner pricing, full feature set every tier | Keep pricing simple; avoid nickel-and-diming core notes |
| Telehealth, recalls, invoicing, Stripe/Xero (region-dependent) | Phase 2+; MVP can stay leaner |
| Excellent support reputation | Process/ops eventually matter as much as product |
| Open customer API (unusual in health SaaS) | Ecosystem is a moat; Treow needs native AI so clinics don’t need 3 apps |

**Bottom line:** Cliniko wins on **simplicity and trust**. Treow should feel equally friendly — then beat them where Cliniko deliberately under-ships.

---

## Cliniko feature map (baseline to match for parity)

### Booking & scheduling
- Multi-practitioner calendar, recurring appointments, appointment types
- Online booking (hosted page / embed)
- Email reminders; SMS as add-on
- Recalls / follow-up reminders
- Multi-location (basic)

### Clinical records
- Custom note templates (builder)
- Drafts, lock/sign behaviour
- Body charts / diagrams
- File uploads on patient record
- Incomplete-note flags
- Only **two** default templates out of the box (initial + standard) — rest DIY

### Money
- Invoices, payments, expenses
- Stripe / accounting connections (market-dependent)
- UK private insurer claiming often via partners (e.g. Effra), not deep native complexity

### Business
- Reporting (basic — widely criticised as thin)
- Internal message board
- Patient forms / portal
- Connected apps + API

### What Cliniko does *not* ship natively
- **No native AI scribe / ambient notes** — deliberate stance; relies on Connected Apps (Heidi, CliniScribe, PatientNotes, etc.) → extra login + subscription
- No native **task / to-do** system
- Thin **analytics** (rebooking rates, treatment mix revenue, marketing attribution weak)
- No first-class **rooms / resources** (workarounds = fake “practitioners”)
- No **webhooks** (integrations poll; rate limit 200 req/min)
- Draft-note **collaboration / peer sign-off** limited
- Credit packs / memberships awkward
- Ceiling for multi-site groups

---

## Where users say Cliniko falls short

Recurring themes across G2/Capterra summaries and review articles:

1. **Documentation time** — templates help, but typing still owns evenings; AI is bolted on via third parties  
2. **Reporting too shallow** for growth-minded clinics  
3. **No tasks** — care coordination lives in WhatsApp / sticky notes  
4. **Template onboarding friction** for multi-discipline clinics  
5. **Multi-location / rooms** feel bolted on as clinics scale  
6. **API gaps** for real-time automation (no webhooks)  
7. **Stack tax** — PMS + Heidi + AI receptionist + chase tool = cost and consent sprawl  

---

## Competitive context (AI notes)

| Product | AI notes stance |
|---------|-----------------|
| **Cliniko** | No native scribe; Connected Apps (Heidi etc.) |
| **Zanda** (ex Power Diary) | Native BizzyAI Scribe (record → draft notes) — direct threat |
| **Jane** | Strong PMS; AI varies by market |
| **Treow (us)** | **Native Visit mode**: record → organise → sign inside one product |

Opportunity: Cliniko users who want AI today buy Heidi (often Practice/Enterprise tier) *and* keep Cliniko. Treow collapses that into one UK-focused MSK workflow.

---

## How Treow can improve on Cliniko

Prioritised for UK mixed physio / osteo / manual therapy, mark-paid MVP, PWA recording.

### Tier A — Must-win differentiators (build into core)

| # | Improvement | Why it beats Cliniko | Treow plan |
|---|-------------|----------------------|------------|
| A1 | **Native AI scribe in Visit mode** | Cliniko forces second vendor; Zanda already ships native | Record → STT → SOAP/custom draft → human sign; consent + audit built-in |
| A2 | **One surface for day-of care** | Cliniko splits calendar / notes / (external) scribe | Today → Open visit → record + note + rebook suggest |
| A3 | **Mixed-discipline starter templates** | Cliniko ships 2 defaults; multi-discipline DIY hurts | Pack: Physio initial/review, Osteopathy session, Manual therapy, SOAP |
| A4 | **UK-first defaults** | Cliniko is global AU-rooted | `Europe/London`, GBP, UK GDPR copy, UK phone formats |
| A5 | **Stay as friendly as Cliniko** | Their #1 moat is UX calm | No dashboard clutter; progressive disclosure for “advanced” |

### Tier B — Beat them on operations (post-MVP, high leverage)

| # | Improvement | Cliniko gap | Treow approach |
|---|-------------|-------------|----------------|
| B1 | **Smart waitlist fill** | Manual / limited automation; no webhooks for instant react | Cancel → offer next waitlist patient in minutes (in-product jobs) |
| B2 | **Suggest next appointment from Plan** | Recalls exist; not note-aware | After sign, one-tap book from AI Plan section |
| B3 | **Lightweight tasks** | Frequently cited missing feature | “Chase intake”, “Sign draft”, “Unpaid invoice” task inbox |
| B4 | **Useful practice pulse** | Reporting called thin | 5 metrics: utilisation, rebook rate, unsigned notes, unpaid invoices, new vs returning |
| B5 | **Rooms / couches as resources** | Workarounds as fake practitioners | First-class resources on calendar |
| B6 | **Webhooks + event automations** | Poll-only API | Emit booking/cancel/note-signed events for clinic tools |

### Tier C — Match later (parity, don’t delay launch)

| Area | Note |
|------|------|
| Body charts | Cliniko strength — phase 2 |
| Telehealth | Built-in or partner — phase 2 |
| SMS reminders | After email works |
| Stripe / online pay | User chose mark-paid MVP; add later |
| Xero | Strong UK ask — phase 2 |
| Private medical insurance / Effra-class | Partner before build |
| Multi-site group reporting | After single-clinic excellence |

### Tier D — Do **not** try to beat Cliniko on (yet)

- Being the global “everything PMS” for 95 countries  
- Charity/brand heritage (they have 15 years)  
- Breadth of Connected Apps directory  
- Competing on “we also refuse AI” — opposite strategy  

---

## Product narrative (vs Cliniko)

> **Cliniko** is the calm clinic OS you type notes into.  
> **Treow** is the calm clinic OS that **listens to the visit and drafts the note** — built for UK physio, osteopathy, and manual therapy teams — without a second AI subscription.

Honesty check: Zanda already markets native AI scribe. Treow must win on **MSK Visit-mode depth**, **UK mixed-clinic templates**, **sign/consent trust**, and **booking that still feels Cliniko-simple**.

---

## Risks if we only “copy Cliniko + AI”

1. **Parity trap** — years to match calendar edge cases while Zanda/Heidi move  
2. **Trust failure** — one bad hallucinated note kills UK clinic adoption  
3. **Feature bloat** — losing the Cliniko calmness that users praise  

Mitigation: ship Visit mode + booking excellence first; steal Cliniko’s simplicity; take their documented gaps (tasks, reporting, resources, native AI) as the roadmap.

---

## Recommended Treow roadmap adjustment

1. **Now:** Native AI Visit mode + UK MSK template pack + mark-paid money (already in plan)  
2. **Next:** Waitlist auto-offer + suggest rebook from Plan + unsigned-notes / unpaid tasks  
3. **Then:** Practice pulse metrics + rooms/resources  
4. **Later:** Body charts, telehealth, SMS, Xero, insurer partners  

---

## Source notes

- Cliniko features: https://www.cliniko.com/features/  
- Limitations (reporting, tasks, templates, draft collaboration): Pabau / Medesk / Wisevu Cliniko reviews (2026)  
- No native AI; Connected Apps / Heidi: Cliniko AI ecosystem analyses; Heidi Cliniko integration (UK)  
- Zanda native BizzyAI Scribe: Power Diary vs Cliniko comparisons (2025–2026)  
- API: no webhooks, 200/min, notes exposed — docs.api.cliniko.com + integrator write-ups  
- UK insurer billing partner pattern: Effra + Cliniko-style PMS  
