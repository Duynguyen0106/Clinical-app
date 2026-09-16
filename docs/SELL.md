# Sell Treow Clinic — commercial readiness

**What we sell:** **Treow Clinic** — a full UK clinic management system:

- Diary & online booking (website button / embed)
- Clinical notes (visit record → organised draft → sign)
- Money in GBP (invoices, deposits, receipts, staff pay)
- Clinic day ops (Today, tasks, waitlist, rooms, team leave)
- Hosted SaaS — you update remotely; clinics do not install software

**Demo:** Northbank Manual Therapy (`/login`, password `treow-demo`) is the live product tour — not a separate SKU.

## Positioning for customers

**Headline:** Full clinic management for UK allied health — not another booking bolt-on.

Lead with the **whole clinic day**:

1. Attract patients online (embed + book page)
2. Run the diary cleanly (multi-practitioner, rooms, waitlist)
3. Finish notes faster (record → organise → sign)
4. Keep money tidy (GBP invoices & deposits)
5. Stay UK-minded (privacy, retention, EU hosting)

**Objection handling:** “Is this just online booking?” → No. Booking is included and syncs to the same diary; the product is diary + notes + money + ops in one hosted app.

## What clinics get

1. **Cloud clinic app** — staff sign in at `/login` (no install).
2. **Website integration** — Settings → **Website booking** (button + iframe).
3. **Remote updates** — one deploy; every clinic receives the release.
4. **Monthly subscription** — owner **Billing** (Stripe Checkout / portal when configured).

## Provision a paying / pilot clinic

```bash
curl -X POST "$APP_BASE_URL/api/v1/admin/clinics" \
  -H "Authorization: Bearer $ADMIN_PROVISION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Riverside Physio",
    "slug": "riverside-physio",
    "owner": {
      "email": "owner@riverside.example",
      "name": "Pat Owner",
      "password": "change-me-now-8+"
    },
    "plan": "PILOT",
    "trialDays": 30
  }'
```

Response includes login URL, book/embed URLs, and website HTML snippets.

Requires `ADMIN_PROVISION_SECRET` (≥24 characters).

## Stripe Billing (clinic → Treow)

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Platform Stripe account |
| `STRIPE_PRICE_STARTER` | Starter plan price ID |
| `STRIPE_PRICE_CLINIC` | Clinic plan price ID |
| `STRIPE_WEBHOOK_SECRET` | `/api/v1/billing/webhook` |

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Owner UI: `/app/billing`.

Patient deposits remain separate (`PAYMENT_PROVIDER`).

## Suggested commercial path

1. Marketing site sells the **full clinic system**.
2. Demo login + patient booking for self-serve exploration.
3. Guided pilot via provision API + website snippets.
4. Stripe Billing for monthly plans.

See also: `docs/WEBSITE_INTEGRATION.md`, `docs/DEPLOY.md`, `docs/PILOT.md`.
