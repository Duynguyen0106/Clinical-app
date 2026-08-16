"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ApiError } from "@/lib/api";

type Offer = {
  id: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  expiresAt: string | null;
  serviceName: string;
  practitionerName: string | null;
  patientFirstName: string;
  clinic: { name: string; slug: string; timezone: string };
  actionable: boolean;
};

type Props = { params: Promise<{ token: string }> };

export default function WaitlistOfferPage({ params }: Props) {
  const { token: rawToken } = use(params);
  const token = decodeURIComponent(rawToken);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ offer: Offer }>(
      `/public/waitlist?token=${encodeURIComponent(token)}`,
      { auth: false },
    )
      .then((d) => setOffer(d.offer))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function act(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        action: string;
        appointment?: { startsAt: string };
      }>("/public/waitlist", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ token, action }),
      });
      if (action === "accept" && res.appointment) {
        setMessage(
          `Booked for ${format(new Date(res.appointment.startsAt), "EEE d MMM · HH:mm")}.`,
        );
      } else {
        setMessage("Thanks — we have noted that you declined this slot.");
      }
      const refreshed = await api<{ offer: Offer }>(
        `/public/waitlist?token=${encodeURIComponent(token)}`,
        { auth: false },
      );
      setOffer(refreshed.offer);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update offer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page book-manage-page">
      <div className="auth-brand">
        <BrandLogo variant="full" className="auth-logo" priority />
        <p className="brand-motto">{BRAND.motto}</p>
      </div>
      <div className="auth-form">
        <h1>Waitlist offer</h1>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="alert-line">{message}</p> : null}
        {!offer && !error ? <p className="muted">Loading offer…</p> : null}
        {offer ? (
          <>
            <p className="muted">
              Hi {offer.patientFirstName} — {offer.clinic.name} has a slot for
              you.
            </p>
            <p className="apt-name">{offer.serviceName}</p>
            <p className="muted">
              {offer.startsAt
                ? format(new Date(offer.startsAt), "EEE d MMM yyyy · HH:mm")
                : "Time unavailable"}
              {offer.practitionerName ? ` · ${offer.practitionerName}` : ""}
            </p>
            {offer.expiresAt ? (
              <p className="muted">
                Offer expires{" "}
                {format(new Date(offer.expiresAt), "d MMM · HH:mm")}
              </p>
            ) : null}
            <p className="muted">
              Status: {offer.status.replaceAll("_", " ").toLowerCase()}
            </p>
            {offer.actionable ? (
              <div className="apt-actions" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void act("accept")}
                >
                  Accept slot
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void act("decline")}
                >
                  Decline
                </button>
              </div>
            ) : null}
            <Link
              href={`/book/${offer.clinic.slug}`}
              className="btn-ghost"
              style={{ marginTop: "0.75rem" }}
            >
              Book another time
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
