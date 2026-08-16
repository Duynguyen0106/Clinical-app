# Phone checklist (while waiting for a computer)

Things you can finish on mobile before deploy day.

## Accounts to create (free tiers OK)

- [ ] [Neon](https://neon.tech) — Europe region project (don’t deploy yet; just have the account)
- [ ] [Vercel](https://vercel.com) — connect GitHub `Clinical-app`
- [ ] [Resend](https://resend.com) — account only; domain verify can wait for laptop
- [ ] Optional: OpenAI account (keep unused until DPA signed)

## Decisions to write down (Notes app)

- [ ] Pilot clinic name + owner email/phone
- [ ] Your `SUPPORT_EMAIL` for Settings
- [ ] Keep billing as **mark paid only** for beta? (recommended: yes)
- [ ] AI stays **mock** for first 5 visits? (recommended: yes)

## Read / review (15–20 min)

- [ ] Live privacy copy mindset: open repo → `docs/UK_COMPLIANCE.md`
- [ ] Launch order: `docs/LAUNCH.md`
- [ ] Pilot script: `docs/PILOT.md`

## Outreach (message a design partner)

Copy/paste:

> Hi — I’m piloting Treow, a UK clinic tool with visit recording that drafts the clinical note for you to sign (physio/osteo). Looking for 1 clinic to run ~5 real visits over a couple of weeks. No charge. You stay controller of patient data; we start with AI draft off/mock until DPAs are in place. Interested in a short walkthrough?

- [ ] Send to 1–3 clinics  
- [ ] Book a 20‑min intro call  

## Do **not** try on phone

- Production `prisma db push` / seed  
- Replacing logo via git  
- Full Visit mic QA  
- Complex DNS for email domain  

When you’re back on a computer: Neon connection string → Vercel env → deploy → follow `docs/DEPLOY.md`.
