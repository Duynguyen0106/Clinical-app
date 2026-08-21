"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Printer, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { LAUNCH } from "@/modules/config/brand";

type Invoice = {
  id: string;
  amountCents: number;
  status: string;
  patient: { firstName: string; lastName: string };
  appointmentId: string | null;
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

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MoneyPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Money" subtitle="Loading…">
          <p className="muted">Loading invoices…</p>
        </AppShell>
      }
    >
      <MoneyPageInner />
    </Suspense>
  );
}

function MoneyPageInner() {
  const searchParams = useSearchParams();
  const unpaidOnly = searchParams.get("status") === "unpaid";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDoc | null>(null);

  const load = useCallback(() => {
    void api<{ invoices: Invoice[] }>("/invoices")
      .then((d) => setInvoices(d.invoices))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!unpaidOnly) return invoices;
    return invoices.filter(
      (inv) => inv.status === "SENT" || inv.status === "DRAFT",
    );
  }, [invoices, unpaidOnly]);

  async function markPaid(id: string) {
    await api(`/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ method: "card_terminal" }),
    });
    load();
  }

  async function markUnpaid(id: string) {
    await api(`/invoices/${id}/pay`, { method: "DELETE" });
    load();
  }

  async function openReceipt(id: string) {
    setError(null);
    try {
      const { document } = await api<{ document: ReceiptDoc }>(
        `/invoices/${id}/receipt`,
      );
      setReceipt(document);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load receipt");
    }
  }

  return (
    <AppShell
      title="Money"
      subtitle="GBP invoices — mark paid when cash, card terminal, or transfer settles."
    >
      <div className="panel">
        <div className="panel-head">
          <h2>{unpaidOnly ? "Unpaid invoices" : "Invoices"}</h2>
          <div className="view-toggle" role="group">
            <Link
              href="/app/money"
              className={`btn-sm ${!unpaidOnly ? "btn-secondary" : "btn-ghost"}`}
            >
              All
            </Link>
            <Link
              href="/app/money?status=unpaid"
              className={`btn-sm ${unpaidOnly ? "btn-secondary" : "btn-ghost"}`}
            >
              Unpaid
            </Link>
          </div>
          <span className="count">{visible.length}</span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="apt-list">
          {visible.map((inv) => (
            <li key={inv.id} className="apt-row money-row">
              <div className="apt-body" style={{ gridColumn: "1 / 3" }}>
                <p className="apt-name">
                  {inv.patient.firstName} {inv.patient.lastName}
                </p>
                <p className="muted">{inv.status}</p>
              </div>
              <div className="apt-actions">
                <strong>{formatGbp(inv.amountCents)}</strong>
                <span className={`status status-${inv.status.toLowerCase()}`}>
                  {inv.status.toLowerCase()}
                </span>
                {inv.status !== "PAID" ? (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => void markPaid(inv.id)}
                  >
                    Mark paid
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => void openReceipt(inv.id)}
                    >
                      <Printer size={14} aria-hidden /> Receipt
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => void markUnpaid(inv.id)}
                    >
                      Mark unpaid
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {visible.length === 0 && !error ? (
          <p className="muted">
            {unpaidOnly ? "No unpaid invoices." : "No invoices yet."}
          </p>
        ) : null}
      </div>

      {receipt ? (
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
                >
                  <Printer size={14} aria-hidden /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setReceipt(null)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <article className="print-sheet print-document">
              <header className="print-head">
                <div className="print-letterhead">
                  <div className="print-letterhead-main">
                    {receipt.clinic.logoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={receipt.clinic.logoDataUrl}
                        alt=""
                        className="print-clinic-logo"
                      />
                    ) : null}
                    <div>
                      <p className="print-clinic">{receipt.clinic.name}</p>
                      {receipt.clinic.address ? (
                        <p className="print-contact">{receipt.clinic.address}</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="print-ref">Ref {receipt.reference}</p>
                </div>
              </header>
              <h1>Receipt</h1>
              <p className="print-meta">
                Paid · {formatDateTime(receipt.paidAt)}
              </p>
              <section className="print-block">
                <h2>Patient</h2>
                <p>
                  <strong>{receipt.patient.fullName}</strong>
                </p>
              </section>
              <section className="print-block">
                <h2>Service</h2>
                <p>
                  {receipt.serviceName ?? "Consultation"}
                  {receipt.appointmentStartsAt
                    ? ` · ${formatDateTime(receipt.appointmentStartsAt)}`
                    : ""}
                </p>
              </section>
              <section className="print-block">
                <h2>Amount</h2>
                <p>
                  <strong>{formatGbp(receipt.amountCents)}</strong>
                </p>
              </section>
              <footer className="print-foot">
                <p>
                  {receipt.clinic.name} · Ref {receipt.reference}
                </p>
              </footer>
            </article>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
