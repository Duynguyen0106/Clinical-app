"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BrandLogo } from "@/components/BrandLogo";

function DepositSuccessBody() {
  const params = useSearchParams();
  const appointmentId = params.get("appointmentId");

  return (
    <main className="book-shell">
      <div className="book-card">
        <BrandLogo />
        <h1>Deposit received</h1>
        <p className="muted">
          Thank you — your card payment was submitted. The clinic will confirm
          your appointment shortly.
        </p>
        {appointmentId ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Reference: {appointmentId.slice(0, 8)}…
          </p>
        ) : null}
        <p className="muted">
          You should also receive a booking confirmation email if the clinic has
          email delivery enabled.
        </p>
        <Link href="/" className="btn-primary">
          Back to home
        </Link>
      </div>
    </main>
  );
}

export default function DepositSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="book-shell">
          <div className="book-card">
            <p className="muted">Confirming payment…</p>
          </div>
        </main>
      }
    >
      <DepositSuccessBody />
    </Suspense>
  );
}
