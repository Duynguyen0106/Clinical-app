"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LAUNCH } from "@/modules/config/brand";

type DemoInvoice = {
  id: string;
  patient: string;
  service: string;
  amountPence: number;
  status: "unpaid" | "paid";
};

const INITIAL: DemoInvoice[] = [
  {
    id: "inv_1",
    patient: "James Okafor",
    service: "Osteopathy · Follow-up",
    amountPence: 6500,
    status: "unpaid",
  },
  {
    id: "inv_2",
    patient: "Mina Patel",
    service: "Manual therapy",
    amountPence: 5500,
    status: "paid",
  },
];

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

export default function MoneyPage() {
  const [invoices, setInvoices] = useState(INITIAL);

  function markPaid(id: string) {
    setInvoices((list) =>
      list.map((inv) =>
        inv.id === id ? { ...inv, status: "paid" as const } : inv,
      ),
    );
  }

  function markUnpaid(id: string) {
    setInvoices((list) =>
      list.map((inv) =>
        inv.id === id ? { ...inv, status: "unpaid" as const } : inv,
      ),
    );
  }

  return (
    <AppShell
      title="Money"
      subtitle="GBP invoices — mark paid when cash, card terminal, or transfer settles. No online payments in MVP."
    >
      <div className="panel">
        <div className="panel-head">
          <h2>Invoices</h2>
          <span className="count">{invoices.length}</span>
        </div>
        <ul className="apt-list">
          {invoices.map((inv) => (
            <li key={inv.id} className="apt-row money-row">
              <div className="apt-body" style={{ gridColumn: "1 / 3" }}>
                <p className="apt-name">{inv.patient}</p>
                <p className="muted">{inv.service}</p>
              </div>
              <div className="apt-actions">
                <strong>{formatGbp(inv.amountPence)}</strong>
                <span className={`status status-${inv.status}`}>
                  {inv.status}
                </span>
                {inv.status === "unpaid" ? (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => markPaid(inv.id)}
                  >
                    Mark paid
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => markUnpaid(inv.id)}
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
