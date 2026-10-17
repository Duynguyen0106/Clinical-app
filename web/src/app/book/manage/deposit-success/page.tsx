"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ApiError } from "@/lib/api";

function DepositSuccessBody() {
  const params = useSearchParams();
  const token = params.get("token");
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<"checking" | "paid" | "pending" | "error">(
    sessionId && token ? "checking" : "pending",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !token) return;
    let cancelled = false;
    void api<{ status: string }>(
      "/public/deposits",
      {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          action: "verify_session",
          sessionId,
          token,
        }),
      },
    )
      .then((d) => {
        if (cancelled) return;
        setStatus(d.status === "paid" ? "paid" : "pending");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof ApiError ? e.message : "Could not verify payment");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  return (
    <main className="book-shell">
      <div className="book-card">
        <BrandLogo />
        <h1>
          {status === "checking"
            ? "Confirming payment…"
            : status === "paid"
              ? "Deposit received"
              : status === "error"
                ? "Payment check"
                : "Deposit submitted"}
        </h1>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="muted">
          {status === "paid"
            ? "Thank you — your card payment was confirmed and the clinic has been notified."
            : status === "checking"
              ? "Please wait while we confirm your card payment with the bank."
              : "Thank you — your card payment was submitted. The clinic will confirm your appointment shortly."}
        </p>
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
