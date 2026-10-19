"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, isValid, parseISO } from "date-fns";
import { BrandLogo } from "@/components/BrandLogo";
import {
  BankTransferInstructionsPanel,
  manageTokenFromHref,
  type BankTransferDetails,
} from "@/components/BankTransferInstructions";
import { BRAND } from "@/modules/config/brand";
import { api, ApiError } from "@/lib/api";

type Clinic = {
  name: string;
  slug: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  brandColour?: string | null;
  logoUrl?: string | null;
  booking?: { policyText?: string | null };
};

export type BookingConfirmedDetails = {
  patientName?: string;
  email?: string;
  startsAt?: string;
  serviceName?: string;
  practitionerName?: string;
  manageHref?: string;
  depositStatus?: string;
  depositCents?: number;
  policyText?: string;
  /** Bank details from booking handoff (no manage token required). */
  bankTransfer?: BankTransferDetails;
  /** True when confirmation email was handed to Resend (or similar) */
  emailDelivered?: boolean;
};

type Props = {
  slug: string;
  details?: BookingConfirmedDetails;
  /** Compact chrome when opened inside a website iframe */
  embed?: boolean;
};

function formatWhen(iso?: string) {
  if (!iso) return null;
  const d = parseISO(iso);
  if (!isValid(d)) return null;
  return format(d, "EEEE d MMMM yyyy · HH:mm");
}

export function BookingConfirmed({ slug, details = {}, embed = false }: Props) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [bankTransfer, setBankTransfer] = useState<BankTransferDetails | null>(
    null,
  );
  const [bankError, setBankError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ clinic: Clinic }>(`/public/clinics/${slug}`, { auth: false })
      .then((d) => setClinic(d.clinic))
      .catch(() => setClinic(null));
  }, [slug]);

  useEffect(() => {
    if (details.depositStatus !== "bank_transfer") return;
    // Prefer handoff payload from the booking response (no manage token).
    if (details.bankTransfer) {
      setBankTransfer(details.bankTransfer);
      return;
    }
    // Legacy: fetch via manage token if present (old tabs / emailed deep links).
    const token = manageTokenFromHref(details.manageHref);
    if (!token) return;
    let cancelled = false;
    void api<{
      status: string;
      bankTransfer?: BankTransferDetails;
    }>("/public/deposits", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ action: "info", token }),
    })
      .then((d) => {
        if (cancelled) return;
        if (d.bankTransfer) setBankTransfer(d.bankTransfer);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBankError(
          e instanceof ApiError
            ? e.message
            : "Could not load bank transfer details",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [details.depositStatus, details.manageHref, details.bankTransfer]);

  const accent = clinic?.brandColour || undefined;
  const clinicLogo = clinic?.logoUrl ?? null;
  const when = formatWhen(details.startsAt);
  const policy = details.policyText || clinic?.booking?.policyText || null;
  const shellClass = embed ? "book-page book-page-embed" : "book-page";

  const summaryLines = useMemo(() => {
    const lines: string[] = [];
    if (details.serviceName) lines.push(details.serviceName);
    if (details.practitionerName) lines.push(details.practitionerName);
    if (clinic?.address) lines.push(clinic.address);
    if (clinic?.phone) lines.push(clinic.phone);
    return lines;
  }, [details.serviceName, details.practitionerName, clinic?.address, clinic?.phone]);

  return (
    <div className={shellClass}>
      <div className="book-shell">
        {!embed ? (
          <div className="book-brand">
            {clinicLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinicLogo} alt="" className="book-clinic-logo" />
            ) : (
              <BrandLogo variant="mark" className="book-mark" priority />
            )}
            <p
              className="brand-word"
              style={accent ? { color: accent } : undefined}
            >
              {clinic?.name ?? BRAND.shortName}
            </p>
            <p className="brand-motto">{BRAND.motto}</p>
          </div>
        ) : null}

        <div className="book-card">
          {embed && clinicLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinicLogo} alt="" className="book-clinic-logo" />
          ) : null}
          <p
            className="eyebrow"
            style={accent ? { color: accent } : undefined}
          >
            {clinic?.name ?? slug}
          </p>
          <h1>You&apos;re booked</h1>
          {details.patientName || when ? (
            <p className="book-confirm-lead">
              {[details.patientName, when].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p className="muted">
              Thanks — your appointment with{" "}
              {clinic?.name ?? "the clinic"} is confirmed.
            </p>
          )}

          {summaryLines.length > 0 ? (
            <ul className="book-confirm-summary">
              {summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}

          <p>
            Your appointment is confirmed
            {details.email ? (
              <>
                {" "}
                for <strong>{details.email}</strong>
              </>
            ) : null}
            .
            {details.emailDelivered && details.email ? (
              <>
                {" "}
                A confirmation email with your manage link is on its way — use
                that link to cancel or reschedule.
              </>
            ) : details.email ? (
              <>
                {" "}
                Check your inbox for the confirmation email with a manage link
                if you need to cancel or reschedule.
              </>
            ) : null}
          </p>

          {details.depositStatus ? (
            <p className="alert-line">
              {details.depositStatus === "paid" && details.depositCents != null
                ? `Deposit of £${(details.depositCents / 100).toFixed(2)} received — booking confirmed.`
                : details.depositStatus === "bank_transfer" &&
                    details.depositCents != null
                  ? `Pay a £${(details.depositCents / 100).toFixed(2)} deposit by bank transfer to hold this slot.`
                  : details.depositCents != null
                    ? `A deposit of £${(details.depositCents / 100).toFixed(2)} is required to hold this slot.`
                    : null}
            </p>
          ) : null}

          {bankTransfer ? (
            <BankTransferInstructionsPanel details={bankTransfer} />
          ) : null}
          {bankError ? <p className="form-error">{bankError}</p> : null}

          {policy ? <p className="muted book-fineprint">{policy}</p> : null}

          <div className="book-confirm-actions">
            {details.manageHref ? (
              <Link href={details.manageHref} className="btn-primary">
                Manage this booking
              </Link>
            ) : null}
            <Link href={`/book/${slug}`} className="btn-secondary">
              Book another visit
            </Link>
          </div>

          {embed ? (
            <p className="muted embed-foot">You can close this window.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
