"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addMonths, addYears, format, parse } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { LAUNCH } from "@/modules/config/brand";
import {
  addClinicCalendarDays,
  clinicDateKey,
  clinicLocalDateTime,
} from "@/modules/scheduling/clinic-time";

type Preset = "day" | "month" | "year" | "custom";

type RevenueReport = {
  period: {
    preset: Preset;
    from: string;
    to: string;
    label: string;
    timeZone: string;
  };
  totals: {
    collectedCents: number;
    paymentCount: number;
    depositsCents: number;
    depositCount: number;
    outstandingCents: number;
    unpaidInvoiceCount: number;
  };
  byMethod: Array<{
    method: string;
    label: string;
    amountCents: number;
    count: number;
  }>;
  byDay: Array<{ date: string; amountCents: number; count: number }>;
  byMonth: Array<{ month: string; amountCents: number; count: number }>;
  byPractitioner: Array<{
    practitionerId: string | null;
    displayName: string;
    amountCents: number;
    count: number;
  }>;
  byService: Array<{
    appointmentTypeId: string | null;
    name: string;
    amountCents: number;
    count: number;
  }>;
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

function keysForTimezone(timeZone: string, now = new Date()) {
  const today = clinicDateKey(now, timeZone);
  const from = clinicDateKey(
    addClinicCalendarDays(clinicLocalDateTime(today, 0, timeZone), -29, timeZone),
    timeZone,
  );
  return {
    date: today,
    month: today.slice(0, 7),
    year: today.slice(0, 4),
    from,
    to: today,
  };
}

function isYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isYm(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function isYear(value: string) {
  return /^\d{4}$/.test(value);
}

export default function FinancePage() {
  const { me, loading: authLoading } = useAuth();
  const isOwner = me?.role === "OWNER";
  const timeZone = me?.clinic.timezone || LAUNCH.timezone;
  const syncedTz = useRef<string | null>(null);

  const initial = keysForTimezone(LAUNCH.timezone);
  const [preset, setPreset] = useState<Preset>("day");
  const [date, setDate] = useState(initial.date);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Align pickers to clinic timezone once auth resolves (UK clinics vs browser TZ).
  useEffect(() => {
    if (authLoading || !me?.clinic.timezone) return;
    if (syncedTz.current === me.clinic.timezone) return;
    syncedTz.current = me.clinic.timezone;
    const next = keysForTimezone(me.clinic.timezone);
    setDate(next.date);
    setMonth(next.month);
    setYear(next.year);
    setFrom(next.from);
    setTo(next.to);
  }, [authLoading, me?.clinic.timezone]);

  const load = useCallback(() => {
    if (!isOwner) return;
    if (preset === "day" && !isYmd(date)) {
      setError("Choose a valid day");
      return;
    }
    if (preset === "month" && !isYm(month)) {
      setError("Choose a valid month");
      return;
    }
    if (preset === "year" && !isYear(year)) {
      setError("Enter a four-digit year");
      return;
    }
    if (preset === "custom") {
      if (!isYmd(from) || !isYmd(to)) {
        setError("Choose a valid from and to date");
        return;
      }
      if (from > to) {
        setError("From must be on or before to");
        return;
      }
    }

    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset });
    if (preset === "day") params.set("date", date);
    if (preset === "month") params.set("month", month);
    if (preset === "year") params.set("year", year);
    if (preset === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    void api<RevenueReport>(`/finance/revenue?${params}`)
      .then((d) => setReport(d))
      .catch((e: Error) => {
        setReport(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [isOwner, preset, date, month, year, from, to]);

  useEffect(() => {
    if (authLoading || !isOwner) return;
    // Wait until clinic TZ sync has run once so the first fetch matches the clinic day.
    if (me?.clinic.timezone && syncedTz.current !== me.clinic.timezone) return;
    load();
  }, [authLoading, isOwner, me?.clinic.timezone, load]);

  function shiftDay(delta: number) {
    if (!isYmd(date)) return;
    const next = addClinicCalendarDays(
      clinicLocalDateTime(date, 0, timeZone),
      delta,
      timeZone,
    );
    setDate(clinicDateKey(next, timeZone));
  }

  function shiftMonth(delta: number) {
    if (!isYm(month)) return;
    const next = addMonths(parse(`${month}-01`, "yyyy-MM-dd", new Date()), delta);
    setMonth(format(next, "yyyy-MM"));
  }

  function shiftYear(delta: number) {
    if (!isYear(year)) return;
    const next = addYears(parse(`${year}-01-01`, "yyyy-MM-dd", new Date()), delta);
    setYear(format(next, "yyyy"));
  }

  if (!authLoading && me && !isOwner) {
    return (
      <AppShell title="Finance" subtitle="Owner only.">
        <div className="panel empty-panel">
          <p className="muted">
            Only clinic owners can view revenue analysis. Day-to-day invoices
            stay under <Link href="/app/money">Money</Link>.
          </p>
        </div>
      </AppShell>
    );
  }

  const totals = report?.totals;

  return (
    <AppShell
      title="Finance"
      subtitle="Collected revenue by day, month, year, or custom period."
    >
      <section className="panel pay-hero">
        <div className="pay-hero-top">
          <div
            className="view-toggle"
            role="tablist"
            aria-label="Revenue period"
          >
            {(
              [
                { id: "day", label: "Day" },
                { id: "month", label: "Month" },
                { id: "year", label: "Year" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={preset === t.id}
                className={`btn-sm ${
                  preset === t.id ? "btn-secondary" : "btn-ghost"
                }`}
                onClick={() => setPreset(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="pay-month-nav finance-period-nav">
          {preset === "day" ? (
            <>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftDay(-1)}
                aria-label="Previous day"
              >
                ← Prev
              </button>
              <label className="pay-month-field">
                <span className="sr-only">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftDay(1)}
                aria-label="Next day"
              >
                Next →
              </button>
            </>
          ) : null}

          {preset === "month" ? (
            <>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                ← Prev
              </button>
              <label className="pay-month-field">
                <span className="sr-only">Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                Next →
              </button>
            </>
          ) : null}

          {preset === "year" ? (
            <>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftYear(-1)}
                aria-label="Previous year"
              >
                ← Prev
              </button>
              <label className="pay-month-field">
                <span className="sr-only">Year</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(e.target.value.slice(0, 4))}
                />
              </label>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => shiftYear(1)}
                aria-label="Next year"
              >
                Next →
              </button>
            </>
          ) : null}

          {preset === "custom" ? (
            <div className="finance-custom-range">
              <label>
                <span className="muted">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                <span className="muted">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>

        <p className="pay-hero-label">
          {report?.period.label ?? "Selected period"}
        </p>
        <p className="pay-hero-amount">
          {loading && !report ? "…" : formatGbp(totals?.collectedCents ?? 0)}
        </p>
        <p className="pay-hero-meta muted">
          {loading && !report
            ? "Loading…"
            : `${totals?.paymentCount ?? 0} payment${
                (totals?.paymentCount ?? 0) === 1 ? "" : "s"
              } collected`}
        </p>
        <p className="pay-hero-hint muted">
          Collected revenue is invoice payments marked paid in this period.
          Deposits are listed separately because they are not invoice payments.
          Outstanding is the current unpaid invoice balance.{" "}
          <Link href="/app/money">Open Money desk</Link>
        </p>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-totals">
        <div className="panel finance-total-card">
          <p className="muted">Deposits collected</p>
          <p className="finance-total-value">
            {formatGbp(totals?.depositsCents ?? 0)}
          </p>
          <p className="muted">
            {totals?.depositCount ?? 0} deposit
            {(totals?.depositCount ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <div className="panel finance-total-card">
          <p className="muted">Outstanding (all unpaid)</p>
          <p className="finance-total-value">
            {formatGbp(totals?.outstandingCents ?? 0)}
          </p>
          <p className="muted">
            {totals?.unpaidInvoiceCount ?? 0} invoice
            {(totals?.unpaidInvoiceCount ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="finance-grid">
        <BreakdownPanel
          title="By payment method"
          empty="No payments in this period."
          rows={(report?.byMethod ?? []).map((r) => ({
            key: r.method,
            label: r.label,
            meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
            amountCents: r.amountCents,
          }))}
        />
        <BreakdownPanel
          title="By practitioner"
          empty="No payments linked to practitioners."
          rows={(report?.byPractitioner ?? []).map((r) => ({
            key: r.practitionerId ?? "none",
            label: r.displayName,
            meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
            amountCents: r.amountCents,
          }))}
        />
        <BreakdownPanel
          title="By service"
          empty="No payments linked to services."
          rows={(report?.byService ?? []).map((r) => ({
            key: r.appointmentTypeId ?? "none",
            label: r.name,
            meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
            amountCents: r.amountCents,
          }))}
        />
        {preset === "year" ? (
          <BreakdownPanel
            title="By month"
            empty="No payments in this year."
            rows={(report?.byMonth ?? []).map((r) => ({
              key: r.month,
              label: r.month,
              meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
              amountCents: r.amountCents,
            }))}
          />
        ) : (
          <BreakdownPanel
            title="By day"
            empty="No payments in this period."
            rows={(report?.byDay ?? []).map((r) => ({
              key: r.date,
              label: r.date,
              meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
              amountCents: r.amountCents,
            }))}
          />
        )}
      </div>
    </AppShell>
  );
}

function BreakdownPanel({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{
    key: string;
    label: string;
    meta: string;
    amountCents: number;
  }>;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="count">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="apt-list finance-breakdown-list">
          {rows.map((r) => (
            <li key={r.key} className="apt-row">
              <div className="apt-body">
                <p className="apt-name">{r.label}</p>
                <p className="muted">{r.meta}</p>
              </div>
              <div className="apt-actions">
                <strong>{formatGbp(r.amountCents)}</strong>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
