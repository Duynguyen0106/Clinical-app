"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, Banknote, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { LAUNCH } from "@/modules/config/brand";

type InvoiceRow = {
  id: string;
  amountCents: number;
  status: string;
  patient: { firstName: string; lastName: string };
};

type ReceiptDoc = {
  kind: "receipt";
  invoiceId: string;
  reference: string;
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    brandColour: string | null;
    logoDataUrl: string | null;
  };
  patient: { fullName: string; email: string | null; phone: string | null };
  serviceName: string | null;
  practitionerName: string | null;
  appointmentStartsAt: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  payments: Array<{ amountCents: number; method: string; paidAt: string }>;
  printedAt: string;
};

type Props = {
  visitId: string;
  appointmentId: string;
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VisitInvoiceActions({ visitId }: Props) {
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDoc | null>(null);

  const load = useCallback(() => {
    void api<{ invoice: InvoiceRow }>(`/visits/${visitId}/invoice`)
      .then((d) => setInvoice(d.invoice))
      .catch((e: Error) =>
        setError(e instanceof ApiError ? e.message : e.message),
      );
  }, [visitId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid() {
    setBusy(true);
    setError(null);
    try {
      const { invoice: paid } = await api<{ invoice: InvoiceRow }>(
        `/visits/${visitId}/invoice`,
        {
          method: "POST",
          body: JSON.stringify({ method: "card_terminal" }),
        },
      );
      setInvoice(paid);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not mark paid");
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt() {
    if (!invoice) return;
    setReceiptOpen(true);
    setReceipt(null);
    try {
      const { document } = await api<{ document: ReceiptDoc }>(
        `/invoices/${invoice.id}/receipt`,
      );
      setReceipt(document);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load receipt");
      setReceiptOpen(false);
    }
  }

  return (
    <div className="rebook-box">
      <h4>Payment</h4>
      {error ? <p className="form-error">{error}</p> : null}
      {invoice ? (
        <>
          <p className="muted">
            {formatGbp(invoice.amountCents)} ·{" "}
            {invoice.status.replaceAll("_", " ").toLowerCase()}
          </p>
          <div className="apt-actions" style={{ marginTop: "0.5rem" }}>
            {invoice.status !== "PAID" ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => void markPaid()}
              >
                <Banknote size={14} aria-hidden /> Mark paid
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void openReceipt()}
              >
                <Printer size={14} aria-hidden /> Print receipt
              </button>
            )}
          </div>
        </>
      ) : !error ? (
        <p className="muted">Preparing invoice…</p>
      ) : null}

      {receiptOpen ? (
        <div className="doc-modal-backdrop" role="presentation">
          <div
            className="doc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Receipt"
          >
            <div className="doc-modal-toolbar no-print">
              <strong>Receipt</strong>
              <div className="doc-modal-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => window.print()}
                  disabled={!receipt}
                >
                  <Printer size={14} aria-hidden /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setReceiptOpen(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {receipt ? <ReceiptPrint doc={receipt} /> : (
              <p className="muted no-print">Preparing receipt…</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptPrint({ doc }: { doc: ReceiptDoc }) {
  const accent = doc.clinic.brandColour || undefined;
  return (
    <article className="print-sheet print-document">
      <header className="print-head">
        <div
          className="print-letterhead"
          style={accent ? { borderBottomColor: accent } : undefined}
        >
          <div className="print-letterhead-main">
            {doc.clinic.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- print data URL
              <img
                src={doc.clinic.logoDataUrl}
                alt=""
                className="print-clinic-logo"
              />
            ) : null}
            <div>
              <p
                className="print-clinic"
                style={accent ? { color: accent } : undefined}
              >
                {doc.clinic.name}
              </p>
              {doc.clinic.address ? (
                <p className="print-contact">{doc.clinic.address}</p>
              ) : null}
              <p className="print-contact">
                {[
                  doc.clinic.phone ? `Tel ${doc.clinic.phone}` : null,
                  doc.clinic.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <p className="print-ref">Ref {doc.reference}</p>
        </div>
      </header>

      <h1>{doc.status === "PAID" ? "Receipt" : "Invoice"}</h1>
      <p className="print-meta">
        {doc.status === "PAID" ? "Paid" : "Due"} ·{" "}
        {formatDateTime(doc.paidAt ?? doc.issuedAt)}
      </p>

      <section className="print-block">
        <h2>Patient</h2>
        <p>
          <strong>{doc.patient.fullName}</strong>
        </p>
        <p>
          {[doc.patient.phone, doc.patient.email].filter(Boolean).join(" · ") ||
            "No contact on file"}
        </p>
      </section>

      <section className="print-block">
        <h2>Service</h2>
        <p>
          {doc.serviceName ?? "Consultation"}
          {doc.appointmentStartsAt
            ? ` · ${formatDateTime(doc.appointmentStartsAt)}`
            : ""}
        </p>
        {doc.practitionerName ? <p>{doc.practitionerName}</p> : null}
      </section>

      <section className="print-block">
        <h2>Amount</h2>
        <p>
          <strong>{formatGbp(doc.amountCents)}</strong> {doc.currency}
        </p>
        {doc.payments.map((p, i) => (
          <p key={i} className="muted">
            {formatGbp(p.amountCents)} via {p.method.replaceAll("_", " ")} ·{" "}
            {formatDateTime(p.paidAt)}
          </p>
        ))}
      </section>

      <footer className="print-foot">
        <p>
          {doc.clinic.name} · Ref {doc.reference} · Printed{" "}
          {formatDateTime(doc.printedAt)}
        </p>
      </footer>
    </article>
  );
}
