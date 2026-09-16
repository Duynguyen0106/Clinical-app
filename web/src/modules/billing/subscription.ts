/**
 * Treow SaaS subscriptions (clinic pays Treow monthly).
 * Separate from patient deposit Checkout in deposits.ts.
 */
import {
  SaasPlan,
  SaasSubscriptionStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";

export const SAAS_PLANS = [
  {
    id: "STARTER" as const,
    name: "Starter",
    priceLabel: "£49",
    period: "/ month",
    blurb: "Online booking + diary for a solo practitioner or small team.",
    seats: "Up to 2 practitioners",
  },
  {
    id: "CLINIC" as const,
    name: "Clinic",
    priceLabel: "£99",
    period: "/ month",
    blurb: "Multi-practitioner booking: rooms, waitlist, deposits, reminders.",
    seats: "Up to 8 practitioners",
    featured: true,
  },
  {
    id: "GROUP" as const,
    name: "Group",
    priceLabel: "Talk to us",
    period: "",
    blurb: "Multi-site booking rollouts with guided onboarding.",
    seats: "Unlimited practitioners",
  },
] as const;

function stripeKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || "";
}

export function getStripePriceId(plan: "STARTER" | "CLINIC") {
  if (plan === "STARTER") {
    return process.env.STRIPE_PRICE_STARTER?.trim() || "";
  }
  return process.env.STRIPE_PRICE_CLINIC?.trim() || "";
}

export function subscriptionConfigured() {
  return Boolean(stripeKey() && (getStripePriceId("STARTER") || getStripePriceId("CLINIC")));
}

export async function getClinicSubscription(clinicId: string) {
  let clinic: {
    id: string;
    name: string;
    slug: string;
    saasPlan: SaasPlan;
    saasStatus: SaasSubscriptionStatus;
    saasTrialEndsAt: Date | null;
    saasCurrentPeriodEnd: Date | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null = null;

  try {
    clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        slug: true,
        saasPlan: true,
        saasStatus: true,
        saasTrialEndsAt: true,
        saasCurrentPeriodEnd: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
  } catch (err) {
    // Pre-migration DBs may not have SaaS columns yet
    console.warn("[saas] subscription columns missing — returning pilot defaults", err);
    const basic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true, slug: true },
    });
    if (!basic) throw notFound("Clinic not found");
    clinic = {
      ...basic,
      saasPlan: SaasPlan.PILOT,
      saasStatus: SaasSubscriptionStatus.TRIALING,
      saasTrialEndsAt: null,
      saasCurrentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  }

  if (!clinic) throw notFound("Clinic not found");

  const trialActive =
    clinic.saasStatus === SaasSubscriptionStatus.TRIALING &&
    (!clinic.saasTrialEndsAt || clinic.saasTrialEndsAt > new Date());

  const accessOk =
    clinic.saasStatus === SaasSubscriptionStatus.ACTIVE ||
    clinic.saasStatus === SaasSubscriptionStatus.TRIALING ||
    clinic.saasStatus === SaasSubscriptionStatus.PAST_DUE ||
    clinic.saasPlan === SaasPlan.PILOT;

  return {
    ...clinic,
    trialActive,
    accessOk,
    stripeConfigured: subscriptionConfigured(),
    plans: SAAS_PLANS,
  };
}

async function stripeForm(
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const key = stripeKey();
  if (!key) throw badRequest("STRIPE_SECRET_KEY is not configured");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[saas:stripe]", path, text);
    throw badRequest("Stripe request failed");
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function createSubscriptionCheckout(args: {
  clinicId: string;
  ownerEmail: string;
  plan: "STARTER" | "CLINIC";
}) {
  const priceId = getStripePriceId(args.plan);
  if (!priceId) {
    throw badRequest(
      `Stripe price not configured for ${args.plan} (set STRIPE_PRICE_${args.plan})`,
    );
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: args.clinicId } });
  if (!clinic) throw notFound("Clinic not found");

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set(
    "success_url",
    `${getAppBaseUrl()}/app/billing?checkout=success`,
  );
  params.set(
    "cancel_url",
    `${getAppBaseUrl()}/app/billing?checkout=cancel`,
  );
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", clinic.id);
  params.set("metadata[clinicId]", clinic.id);
  params.set("metadata[plan]", args.plan);
  params.set("subscription_data[metadata][clinicId]", clinic.id);
  params.set("subscription_data[metadata][plan]", args.plan);
  if (clinic.stripeCustomerId) {
    params.set("customer", clinic.stripeCustomerId);
  } else {
    params.set("customer_email", args.ownerEmail);
  }

  const session = await stripeForm("checkout/sessions", params);
  return {
    checkoutUrl: String(session.url ?? ""),
    sessionId: String(session.id ?? ""),
  };
}

export async function createBillingPortalSession(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) throw notFound("Clinic not found");
  if (!clinic.stripeCustomerId) {
    throw badRequest("No Stripe customer yet — start a subscription first");
  }
  const params = new URLSearchParams();
  params.set("customer", clinic.stripeCustomerId);
  params.set("return_url", `${getAppBaseUrl()}/app/billing`);
  const session = await stripeForm("billing_portal/sessions", params);
  return { portalUrl: String(session.url ?? "") };
}

function mapStripeStatus(status: string): SaasSubscriptionStatus {
  switch (status) {
    case "active":
      return SaasSubscriptionStatus.ACTIVE;
    case "trialing":
      return SaasSubscriptionStatus.TRIALING;
    case "past_due":
    case "unpaid":
      return SaasSubscriptionStatus.PAST_DUE;
    case "canceled":
    case "incomplete_expired":
      return SaasSubscriptionStatus.CANCELED;
    default:
      return SaasSubscriptionStatus.NONE;
  }
}

function mapPlan(metaPlan?: string | null): SaasPlan {
  if (metaPlan === "STARTER") return SaasPlan.STARTER;
  if (metaPlan === "CLINIC") return SaasPlan.CLINIC;
  if (metaPlan === "GROUP") return SaasPlan.GROUP;
  return SaasPlan.CLINIC;
}

export async function applyStripeSubscriptionEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}) {
  const obj = event.data.object;
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const clinicId =
    meta.clinicId ||
    (typeof obj.client_reference_id === "string"
      ? obj.client_reference_id
      : "");

  if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
    if (!clinicId) return { ok: false as const, reason: "missing clinicId" };
    const customerId =
      typeof obj.customer === "string" ? obj.customer : null;
    const subscriptionId =
      typeof obj.subscription === "string" ? obj.subscription : null;
    await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
        saasPlan: mapPlan(meta.plan),
        saasStatus: SaasSubscriptionStatus.ACTIVE,
      },
    });
    return { ok: true as const };
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscriptionId = typeof obj.id === "string" ? obj.id : null;
    const customerId =
      typeof obj.customer === "string" ? obj.customer : null;
    const status =
      typeof obj.status === "string" ? mapStripeStatus(obj.status) : SaasSubscriptionStatus.NONE;
    const periodEnd =
      typeof obj.current_period_end === "number"
        ? new Date(obj.current_period_end * 1000)
        : null;

    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          clinicId ? { id: clinicId } : undefined,
          subscriptionId ? { stripeSubscriptionId: subscriptionId } : undefined,
          customerId ? { stripeCustomerId: customerId } : undefined,
        ].filter(Boolean) as { id?: string; stripeSubscriptionId?: string; stripeCustomerId?: string }[],
      },
    });
    if (!clinic) return { ok: false as const, reason: "clinic not found" };

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        saasStatus:
          event.type === "customer.subscription.deleted"
            ? SaasSubscriptionStatus.CANCELED
            : status,
        saasPlan: mapPlan(meta.plan) || clinic.saasPlan,
        stripeSubscriptionId: subscriptionId ?? clinic.stripeSubscriptionId,
        stripeCustomerId: customerId ?? clinic.stripeCustomerId,
        saasCurrentPeriodEnd: periodEnd,
      },
    });
    return { ok: true as const };
  }

  return { ok: true as const, ignored: true };
}
