"use client";

import type { CSSProperties } from "react";
import { LAUNCH } from "@/modules/config/brand";
import type { ReceiptDocument } from "@/modules/billing/service";

export type ReceiptDoc = ReceiptDocument;

function formatGbp(pence: number, currency: string = LAUNCH.currency) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: currency || LAUNCH.currency,
  }).format(pence / 100);
}

function formatTreatmentDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

function formatPaymentMethod(method: string) {
  return method.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function paymentMethodLabel(doc: ReceiptDoc) {
  if (doc.payments.length === 0) return doc.status === "PAID" ? "—" : "Unpaid";
  const unique = [...new Set(doc.payments.map((p) => formatPaymentMethod(p.method)))];
  return unique.join(", ");
}

/**
 * Patient-facing itemised receipt / invoice print layout
 * (clinic logo + practitioner box + treatment detail lines + signatures).
 */
export function ItemisedReceiptPrint({ doc }: { doc: ReceiptDoc }) {
  const accent = doc.clinic.brandColour?.trim() || "#1f7a7a";
  const navy = "#1a2b48";
  const paid = doc.status === "PAID";
  const prac = doc.practitioner;
  const registerName = prac?.registerName?.trim() || null;
  const body = prac?.registrationBody?.trim() || null;
  const regNo = prac?.registrationNumber?.trim() || null;
  const contactLine = [doc.clinic.phone, doc.clinic.email]
    .filter(Boolean)
    .join(" · ");

  const rows: Array<{ label: string; value: string }> = [
    { label: "Patient name", value: doc.patient.fullName },
    {
      label: "Date of treatment",
      value: formatTreatmentDate(doc.appointmentStartsAt ?? doc.paidAt ?? doc.issuedAt),
    },
    { label: "Service", value: doc.serviceName ?? "Consultation" },
    {
      label: "Duration",
      value:
        doc.durationMinutes != null
          ? `${doc.durationMinutes} minutes`
          : "—",
    },
    {
      label: paid ? "Fee paid" : "Fee due",
      value: formatGbp(doc.amountCents, doc.currency),
    },
    { label: "Payment method", value: paymentMethodLabel(doc) },
    { label: "Receipt / Ref no.", value: doc.reference },
  ];

  return (
    <article
      className="print-sheet print-document itemised-receipt"
      style={
        {
          "--receipt-accent": accent,
          "--receipt-navy": navy,
        } as CSSProperties
      }
    >
      <header className="itemised-receipt-header">
        <div className="itemised-receipt-brand">
          {doc.clinic.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- print data URL
            <img
              src={doc.clinic.logoDataUrl}
              alt=""
              className="itemised-receipt-logo"
            />
          ) : (
            <p className="itemised-receipt-clinic-fallback">{doc.clinic.name}</p>
          )}
        </div>
        <div className="itemised-receipt-title-block">
          <h1>{paid ? "Itemised receipt" : "Itemised invoice"}</h1>
          <p className="itemised-receipt-copy-label">Patient copy</p>
        </div>
      </header>

      {prac ? (
        <section className="itemised-receipt-practitioner">
          <p className="itemised-receipt-kicker">Practitioner</p>
          <p className="itemised-receipt-prac-name">{prac.displayName}</p>
          {body && registerName ? (
            <p className="itemised-receipt-prac-meta">
              {body} register name: {registerName}
            </p>
          ) : null}
          {regNo ? (
            <p className="itemised-receipt-prac-reg">
              {body ? `${body} Reg. No. ${regNo}` : `Reg. No. ${regNo}`}
            </p>
          ) : null}
          {!regNo && prac.professionalTitle ? (
            <p className="itemised-receipt-prac-meta">{prac.professionalTitle}</p>
          ) : null}
        </section>
      ) : null}

      <section className="itemised-receipt-clinic-block">
        <p className="itemised-receipt-clinic-name">{doc.clinic.name}</p>
        {doc.clinic.address ? (
          <p className="itemised-receipt-clinic-line">{doc.clinic.address}</p>
        ) : null}
        {contactLine ? (
          <p className="itemised-receipt-clinic-line">{contactLine}</p>
        ) : null}
        {doc.clinic.website ? (
          <p className="itemised-receipt-clinic-line">{doc.clinic.website}</p>
        ) : null}
      </section>

      <section className="itemised-receipt-details">
        <h2>Treatment details</h2>
        <dl className="itemised-receipt-rows">
          {rows.map((row) => (
            <div key={row.label} className="itemised-receipt-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="itemised-receipt-disclaimer">
        This receipt confirms payment for osteopathic / related clinical care.
        For insurance or cash-plan claims, quote the practitioner name and
        registration number above. No GP referral is required by the clinic.
      </p>

      <footer className="itemised-receipt-signs">
        <div className="itemised-receipt-sign">
          <p className="itemised-receipt-kicker">Practitioner signature</p>
          <div className="itemised-receipt-sign-line" aria-hidden />
          <p className="itemised-receipt-date-line">
            Date <span aria-hidden />
          </p>
        </div>
        <div className="itemised-receipt-sign">
          <p className="itemised-receipt-kicker">Patient acknowledgement</p>
          <div className="itemised-receipt-sign-line" aria-hidden />
          <p className="itemised-receipt-date-line">
            Date <span aria-hidden />
          </p>
        </div>
      </footer>
    </article>
  );
}
