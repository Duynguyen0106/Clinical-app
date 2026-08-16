"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { LAUNCH } from "@/modules/config/brand";

type Invoice = {
  id: string;
  amountCents: number;
  status: string;
  patient: { firstName: string; lastName: string };
  appointmentId: string | null;
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

export default function MoneyPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<{ invoices: Invoice[] }>("/invoices")
      .then((d) => setInvoices(d.invoices))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <AppShell
      title="Money"
      subtitle="GBP invoices — mark paid when cash, card terminal, or transfer settles."
    >
      <div className="panel">
        <div className="panel-head">
          <h2>Invoices</h2>
          <span className="count">{invoices.length}</span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <ul className="apt-list">
          {invoices.map((inv) => (
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
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => void markUnpaid(inv.id)}
                  >
                    Mark unpaid
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
