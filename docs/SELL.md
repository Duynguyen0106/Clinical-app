# Sell Treow — commercial readiness

Treow is sold as **hosted SaaS**: you run one deployment; each clinic is a tenant; their website only embeds your booking URL.

## What clinics get

1. **Cloud app** — staff sign in at `/login` (no install).
2. **Website integration** — Settings → **Website booking** copies:
   - Book online button HTML
   - iframe embed for `/embed/{slug}`
3. **Remote updates** — you deploy once (Vercel); every clinic receives the release.
4. **Monthly subscription** — owner opens **Billing** in the app (Stripe Checkout / Customer Portal when configured).

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

## Stripe Billing (clinic → Treow)

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Shared with deposit Checkout (same Stripe account is fine for MVP) |
| `STRIPE_PRICE_STARTER` | Price ID for Starter (£79) |
| `STRIPE_PRICE_CLINIC` | Price ID for Clinic (£149) |
| `STRIPE_WEBHOOK_SECRET` | Endpoint `/api/v1/billing/webhook` |

Wire Stripe webhook events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Owner UI: `/app/billing` — subscribe, manage payment method.

Patient deposits remain separate (`PAYMENT_PROVIDER` + deposit Checkout).

## Suggested commercial path

1. Pilot clinics on `PILOT` / `TRIALING` (manual provision).
2. Turn on Stripe prices → owners self-serve upgrade from Billing.
3. Later: self-serve signup + Stripe Connect for clinic-owned deposits.

See also: `docs/WEBSITE_INTEGRATION.md`, `docs/DEPLOY.md`, `docs/PILOT.md`.
