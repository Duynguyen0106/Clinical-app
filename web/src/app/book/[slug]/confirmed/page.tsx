"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookingConfirmed,
  type BookingConfirmedDetails,
} from "@/components/BookingConfirmed";
import { readBookingHandoff } from "@/lib/booking-handoff";

type Props = { params: Promise<{ slug: string }> };

function ConfirmedInner({ slug }: { slug: string }) {
  const search = useSearchParams();
  const [handoffReady, setHandoffReady] = useState(false);
  const [handoff, setHandoff] = useState<ReturnType<typeof readBookingHandoff>>(
    null,
  );

  useEffect(() => {
    setHandoff(readBookingHandoff(slug));
    setHandoffReady(true);
  }, [slug]);

  const depositCentsRaw =
    handoff?.depositCents != null
      ? String(handoff.depositCents)
      : search.get("depositCents");
  const details: BookingConfirmedDetails = {
    patientName: search.get("name") ?? undefined,
    email: search.get("email") ?? undefined,
    startsAt: search.get("startsAt") ?? undefined,
    serviceName: search.get("service") ?? undefined,
    practitionerName: search.get("practitioner") ?? undefined,
    // Manage link is email-only. Legacy ?manage= still accepted for old tabs.
    manageHref: search.get("manage") ?? undefined,
    depositStatus:
      handoff?.depositStatus ?? search.get("depositStatus") ?? undefined,
    depositCents: depositCentsRaw ? Number(depositCentsRaw) : undefined,
    policyText: handoff?.policyText,
    bankTransfer: handoff?.bankTransfer,
    emailDelivered: search.get("emailSent") === "1",
  };

  if (!handoffReady) {
    return (
      <div className="book-page">
        <div className="book-card">
          <p className="muted">Confirming your booking…</p>
        </div>
      </div>
    );
  }

  return (
    <BookingConfirmed
      slug={slug}
      details={details}
      embed={search.get("embed") === "1"}
    />
  );
}

/**
 * Stable thank-you URL for post-booking + Google Ads conversion matching.
 * Manage capability is delivered by email, not this page’s query string.
 */
export default function BookingConfirmedPage({ params }: Props) {
  const { slug } = use(params);
  return (
    <Suspense
      fallback={
        <div className="book-page">
          <div className="book-card">
            <p className="muted">Confirming your booking…</p>
          </div>
        </div>
      }
    >
      <ConfirmedInner slug={slug} />
    </Suspense>
  );
}
