"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookingConfirmed,
  type BookingConfirmedDetails,
} from "@/components/BookingConfirmed";

type Props = { params: Promise<{ slug: string }> };

function ConfirmedInner({ slug }: { slug: string }) {
  const search = useSearchParams();
  const depositCentsRaw = search.get("depositCents");
  const details: BookingConfirmedDetails = {
    patientName: search.get("name") ?? undefined,
    email: search.get("email") ?? undefined,
    startsAt: search.get("startsAt") ?? undefined,
    serviceName: search.get("service") ?? undefined,
    practitionerName: search.get("practitioner") ?? undefined,
    manageHref: search.get("manage") ?? undefined,
    depositStatus: search.get("depositStatus") ?? undefined,
    depositCents: depositCentsRaw ? Number(depositCentsRaw) : undefined,
    emailDelivered: search.get("emailSent") === "1",
  };

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
 * Ads landing: /book/nguyens-osteopathy
 * Conversion:  /book/nguyens-osteopathy/confirmed
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
