# Cliniko landing & feature sections → Treow UK notes

Research date: 2026-09-15  
Primary sources: [cliniko.com](https://www.cliniko.com/), [cliniko.com/features](https://www.cliniko.com/features/), [cliniko.com/features/appointments](https://www.cliniko.com/features/appointments/), [cliniko.com/pricing](https://www.cliniko.com/pricing/).  
Companion: `docs/COMPETITIVE_CLINIKO.md` (product gaps & Treow advantages).

Use this doc when improving **marketing surface** and when prioritising **product parity** for UK physio / osteopathy / manual therapy clinics. Do not copy Cliniko’s visual brand — steal the **section clarity** and the **feature checklist**.

---

## 1. Cliniko homepage — section inventory (top → bottom)

| # | Section | Headline / purpose | Primary CTA | Treow UK adaptation |
|---|---------|---------------------|-------------|---------------------|
| 0 | **Nav** | Features · Pricing · Security · Connected Apps · Support · News · Charity | Try it for free | Features · How it works · UK & privacy · Book · Clinic sign in |
| 1 | **Hero** | “Software for people who care” — PMS for clinics & allied health; schedule, records, invoices, payments | Explore the features | Brand-first Treow hero: visit-paced notes for UK MSK clinics + Open demo / Book |
| 2 | **Pricing** | “Fair & transparent pricing” — 30-day trial, tiers by practitioner count (USD), SMS add-on | Find out more about pricing | Transparent **demo access** now; later GBP tiers by practitioners (no hidden SMS traps if we can) |
| 3 | **Security** | “Your records are safe with Cliniko” — confidential client records | How we keep data secure | UK GDPR, EU/UK hosting, visit consent + audit, retention in Settings |
| 4 | **Support** | “Unlimited free support” — chat/email + community forum | Learn about support | Demo help + privacy notice; support email when pilot expands |
| 5 | **Connected apps** | MailChimp, Xero, QuickBooks, AI scribes via partners | See connected apps | Treow differentiator: **native AI organise** — fewer bolted-on apps; Xero later |
| 6 | **News / blog** | Product updates + practice tips | Visit the blog | Optional later; skip for beta landing |
| 7 | **Charity** | 2% of subscriptions donated | About donations | Skip (not our brand story yet) |
| 8 | **Final CTA** | “Free for 30 days” | Try for free | “Try the UK clinic demo” + staff / patient CTAs |
| 9 | **Footer** | Features, pricing, security, resources, social | — | Privacy · Sign in · Book · Embed |

### Homepage narrative pattern

1. Emotional / care-led hero  
2. Remove price anxiety early  
3. Trust (security)  
4. Human help (support)  
5. Ecosystem (apps)  
6. Social proof / content  
7. Values  
8. Hard convert CTA  

**Treow beta pattern (UK):** hero → product pillars → visit AI loop → diary/booking → money GBP → UK trust → demo convert. Pricing page comes when we leave free demo.

---

## 2. Cliniko Features hub — category tiles

From [cliniko.com/features](https://www.cliniko.com/features/):

| Category | Cliniko pitch | Treow today | UK improvement backlog |
|----------|---------------|-------------|------------------------|
| **Booking & scheduling** | Clear calendar, online book, repeats, wait list | Calendar, online book/embed, waitlist, rooms, services, reminders jobs | Recurring apts, practitioner↔service mapping, telehealth, group classes, privacy mode |
| **Health records** | Custom templates, incomplete flags, file uploads | Visit record → AI organise → MSK templates → sign; patient timeline | Body charts, richer template builder, incomplete-note flags, file uploads |
| **Finance management** | Invoices, payments, expenses, tax | Mark-paid invoices, deposits, receipts, team pay | Stripe online pay, Xero, expenses, PMI/Effra-class partners |
| **Reporting and tracking** | Performance + marketing channels | Practice pulse / ops tasks (unsigned, unpaid) | Utilisation, rebook rate, treatment-mix revenue, channel attribution |
| **Business management** | Multi-location, SMS, import/export, API, message board | Multi-role staff, clinic brand, RLS path | Multi-site, SMS packs, public API/webhooks, staff message board |

---

## 3. Booking & scheduling — feature checklist (Cliniko appointments page)

Source: [features/appointments](https://www.cliniko.com/features/appointments/).  
Status: **Have** / **Partial** / **Gap** (for UK MSK roadmap).

| Feature | Status | Notes for Treow |
|---------|--------|-----------------|
| Online bookings (24/7, synced) | Have | `/book/[slug]` + embed |
| Telehealth | Gap | Phase 2 |
| Familiar calendar UX | Have | Week/today views |
| Groups & classes | Gap | Pilates/yoga later |
| Multiple locations | Partial | Locations model; UX polish |
| Appointment confirmations (email + ICS) | Partial | Email path; strengthen ICS |
| Privacy mode (hide names) | Gap | Useful for open desks |
| Repeat appointments | Gap | High ask for UK MSK |
| Client search autocomplete | Have | Patient lookup |
| Time zone support | Partial | Clinic TZ Europe/London |
| Automated follow-ups | Partial | Jobs/reminders |
| Rebook from appointment | Partial | Visit rebook |
| Automated reminders (email/SMS) | Partial | Email jobs; SMS console/Twilio |
| One-off availability | Have | Exceptions / leave |
| Flexible calendar views | Have | |
| Wait list | Have | Auto-offer on cancel |
| Custom appointment types | Have | Services page (length + price) |
| Reschedule | Have | Reception + public manage |
| Mobile-friendly calendar | Have | PWA / native shells |
| Register new client while booking | Have | Intake flows |
| Settings per practitioner | Partial | Availability + pay; service linking Gap |
| Attendance / arrived notifications | Gap | |
| History of changes (audit) | Partial | Audits export |
| Keyboard shortcuts | Gap | |
| Online cancellations | Have | Patient manage token |

---

## 4. Pricing page pattern (Cliniko)

- Tiers by **practitioner count**, all features included  
- 30-day free trial, FAQ-heavy transparency  
- SMS credits extra  
- USD published; UK clinics still convert mentally to GBP  

**Treow UK recommendation:** when monetising, publish **GBP**, include SMS policy clearly, keep “all core features every tier”, trial or design-partner demo first.

---

## 5. Landing page implementation map (this PR)

Treow homepage sections mirror Cliniko’s clarity, rewritten for UK MSK:

1. Nav (Features · How it works · UK & privacy · CTAs)  
2. Hero (brand + one headline + lede + CTAs + clinic photography)  
3. Feature pillars (booking · notes · money · ops · UK trust)  
4. How it works — visit loop (Treow differentiator vs Cliniko’s bolted-on AI)  
5. Diary & online booking deep band  
6. Money in GBP deep band  
7. UK security & privacy band  
8. Demo access (transparent try)  
9. Footer  

---

## 6. Product improvement order (from Cliniko gaps + UK fit)

Already strong vs Cliniko: native AI visit loop, rooms, waitlist offers, tasks, services with price/length, UK defaults.

Next (from section 3 Gaps / Partial):

1. Recurring appointments  
2. Practitioner ↔ service settings  
3. Stronger email confirmations + ICS  
4. Privacy mode on calendar  
5. Body charts / richer templates  
6. Stripe + Xero  
7. Practice pulse metrics  
8. Telehealth / SMS packs / public API  

See also Tier A–C tables in `COMPETITIVE_CLINIKO.md`.
