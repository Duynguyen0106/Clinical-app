"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, Banknote, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { LAUNCH } from "@/modules/config/brand";
import {
  ItemisedReceiptPrint,
  type ReceiptDoc,
} from "@/components/ItemisedReceiptPrint";

type InvoiceRow = {
  id: string;
  amountCents: number;
  status: string;
  patient: { firstName: string; lastName: string };
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

export function VisitInvoiceActions({ visitId }: Props) {
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDoc | null>(null);
  const [chooseMethod, setChooseMethod] = useState(false);
  type PayMethod = "cash" | "card_terminal" | "bank_transfer";

  const load = useCallback(() => {
    void api<{ invoice: InvoiceRow | null }>(`/visits/${visitId}/invoice`)
      .then((d) => setInvoice(d.invoice ?? null))
      .catch((e: Error) =>
        setError(e instanceof ApiError ? e.message : e.message),
      );
  }, [visitId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid(method: PayMethod) {
    setBusy(true);
    setError(null);
    try {
      const { invoice: paid } = await api<{ invoice: InvoiceRow }>(
        `/visits/${visitId}/invoice`,
        {
          method: "POST",
          body: JSON.stringify({ method }),
        },
      );
      setInvoice(paid);
      setChooseMethod(false);
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
            {invoice.status === "PAID"
              ? "Paid"
              : invoice.status === "SENT" || invoice.status === "DRAFT"
                ? "Unpaid"
                : invoice.status.replaceAll("_", " ").toLowerCase()}
          </p>
          <div className="apt-actions" style={{ marginTop: "0.5rem" }}>
            {invoice.status !== "PAID" ? (
              chooseMethod ? (
                <div className="money-pay-methods">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void markPaid("cash")}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void markPaid("card_terminal")}
                  >
                    Card
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void markPaid("bank_transfer")}
                  >
                    Transfer
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => setChooseMethod(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => setChooseMethod(true)}
              >
                <Banknote size={14} aria-hidden /> Mark paid
              </button>
              )
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
        <>
          <p className="muted">No invoice yet — reception can create and mark paid.</p>
          <div className="apt-actions" style={{ marginTop: "0.5rem" }}>
            {chooseMethod ? (
              <div className="money-pay-methods">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void markPaid("cash")}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void markPaid("card_terminal")}
                >
                  Card
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void markPaid("bank_transfer")}
                >
                  Transfer
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => setChooseMethod(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => setChooseMethod(true)}
              >
                <Banknote size={14} aria-hidden /> Create &amp; mark paid
              </button>
            )}
          </div>
        </>
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
            {receipt ? <ItemisedReceiptPrint doc={receipt} /> : (
              <p className="muted no-print">Preparing receipt…</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
