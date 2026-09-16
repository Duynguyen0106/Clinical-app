"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Subscription = {
  name: string;
  slug: string;
  saasPlan: string;
  saasStatus: string;
  saasTrialEndsAt: string | null;
  saasCurrentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialActive: boolean;
  accessOk: boolean;
  stripeConfigured: boolean;
  plans: {
    id: string;
    name: string;
    priceLabel: string;
    period: string;
    blurb: string;
    seats: string;
    featured?: boolean;
  }[];
};

export default function BillingPage() {
  const { me } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    void api<{ subscription: Subscription }>("/billing/subscription")
      .then((d) => setSub(d.subscription))
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    if (me?.role !== "OWNER") return;
    load();
  }, [me?.role]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setMessage("Subscription updated — thank you.");
      load();
    }
    if (params.get("checkout") === "cancel") {
      setMessage("Checkout cancelled — no charge was made.");
    }
  }, []);

  async function startCheckout(plan: "STARTER" | "CLINIC") {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ checkout: { checkoutUrl: string } }>(
        "/billing/checkout",
        { method: "POST", body: JSON.stringify({ plan }) },
      );
      if (d.checkout.checkoutUrl) {
        window.location.href = d.checkout.checkoutUrl;
        return;
      }
      setError("No checkout URL returned");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ portal: { portalUrl: string } }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (d.portal.portalUrl) {
        window.location.href = d.portal.portalUrl;
        return;
      }
      setError("No portal URL returned");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Portal failed");
    } finally {
      setBusy(false);
    }
  }

  if (me && me.role !== "OWNER") {
    return (
      <AppShell title="Billing" subtitle="Only clinic owners manage the Treow subscription.">
        <p className="muted">Ask your clinic owner to open Billing.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Billing"
      subtitle="Your Treow Book subscription — online booking and diary. Separate from patient invoices and deposits."
    >
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      <section className="panel">
        <h2>Current plan</h2>
        {sub ? (
          <>
            <p>
              <strong>{sub.saasPlan}</strong> · status{" "}
              <span className="status-pill status-booked">{sub.saasStatus}</span>
            </p>
            {sub.saasTrialEndsAt ? (
              <p className="muted">
                Trial ends{" "}
                {format(new Date(sub.saasTrialEndsAt), "d MMM yyyy")}
              </p>
            ) : null}
            {sub.saasCurrentPeriodEnd ? (
              <p className="muted">
                Current period ends{" "}
                {format(new Date(sub.saasCurrentPeriodEnd), "d MMM yyyy")}
              </p>
            ) : null}
            {sub.stripeCustomerId ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void openPortal()}
              >
                Manage payment method
              </button>
            ) : (
              <p className="muted">
                {sub.stripeConfigured
                  ? "Choose a paid plan below to enter card details securely via Stripe."
                  : "Stripe Billing is not configured on this deployment yet — contact Treow support to activate monthly billing."}
              </p>
            )}
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>

      <section className="panel">
        <h2>Plans</h2>
        <div className="billing-plan-grid">
          {(sub?.plans ?? []).map((p) => (
            <div
              key={p.id}
              className={`billing-plan ${p.featured ? "featured" : ""}`}
            >
              <h3>{p.name}</h3>
              <p className="billing-price">
                {p.priceLabel}
                <span>{p.period}</span>
              </p>
              <p className="muted">{p.blurb}</p>
              <p className="muted">{p.seats}</p>
              {p.id === "STARTER" || p.id === "CLINIC" ? (
                <button
                  type="button"
                  className={p.featured ? "btn-primary" : "btn-secondary"}
                  disabled={busy || !sub?.stripeConfigured}
                  onClick={() =>
                    void startCheckout(p.id as "STARTER" | "CLINIC")
                  }
                >
                  {sub?.saasPlan === p.id ? "Current / renew" : "Subscribe"}
                </button>
              ) : (
                <a
                  className="btn-ghost"
                  href={`mailto:support@treow.example?subject=Treow%20Group%20plan`}
                >
                  Contact sales
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="muted">
        Patient deposits and invoices are separate — configure those under{" "}
        <Link href="/app/settings">Settings</Link> and{" "}
        <Link href="/app/money">Money</Link>.
      </p>
    </AppShell>
  );
}
