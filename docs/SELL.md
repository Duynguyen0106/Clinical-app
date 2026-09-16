# Sell Treow Book — commercial readiness

**What we sell:** **Treow Book** — hosted online booking + staff diary for UK clinics.

**What is demo-only:** **Treow Clinic** (Northbank Manual Therapy seed) — a full clinic day demo so prospects can click around. It is not the commercial SKU.

## Positioning

| Surface | Role |
|---------|------|
| Marketing site (`/`) | Sell Treow Book: embed, diary, reminders, deposits |
| `/book/{slug}` · `/embed/{slug}` | Patient-facing booking product |
| `/login` → demo clinic | Optional tour of diary + ops inside Treow Clinic demo |
| Settings → Website booking | Copy button / iframe for the clinic’s own site |
| Billing | Monthly subscription for Treow Book |

Clinics do **not** download software. You host one app; each clinic is a tenant; their website only embeds your booking URL.

## What clinics get

1. **Public booking** — hosted page + website embed (button or iframe).
2. **Staff diary** — calendar, services, practitioners, rooms, waitlist, notice windows.
3. **Remote updates** — you deploy once; every clinic receives the release.
4. **Monthly subscription** — owner opens **Billing** (Stripe Checkout / Customer Portal when configured).

The AI note / visit-recorder loop in the demo is **showcase context**, not the primary sale.

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

Requires `ADMIN_PROVISION_SECRET` (≥24 characters) in the environment.

## Stripe Billing (clinic → Treow Book)

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Shared with deposit Checkout (same Stripe account is fine for MVP) |
| `STRIPE_PRICE_STARTER` | Price ID for Starter |
| `STRIPE_PRICE_CLINIC` | Price ID for Clinic |
| `STRIPE_WEBHOOK_SECRET` | Endpoint `/api/v1/billing/webhook` |

Wire Stripe webhook events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Owner UI: `/app/billing` — subscribe, manage payment method.

Patient deposits remain separate (`PAYMENT_PROVIDER` + deposit Checkout).

## Suggested commercial path

1. Lead with **Try online booking** (public book / embed demo).
2. Pilot clinics on `PILOT` / `TRIALING` (manual provision + website snippets).
3. Turn on Stripe prices → owners self-serve upgrade from Billing.
4. Keep Treow Clinic demo available for deeper product tours — clearly labelled as demo.

See also: `docs/WEBSITE_INTEGRATION.md`, `docs/DEPLOY.md`, `docs/PILOT.md`.
