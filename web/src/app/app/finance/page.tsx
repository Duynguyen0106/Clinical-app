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
  truncated?: boolean;
  breakdownPaymentCount?: number;
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

const MAX_CUSTOM_DAYS = 366;

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

function formatMonthLabel(month: string) {
  try {
    return format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
  } catch {
    return month;
  }
}

function daysBetweenKeys(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000) + 1;
}

function localPeriodLabel(
  preset: Preset,
  date: string,
  month: string,
  year: string,
  from: string,
  to: string,
) {
  try {
    if (preset === "day" && isYmd(date)) {
      return format(parse(date, "yyyy-MM-dd", new Date()), "d MMMM yyyy");
    }
    if (preset === "month" && isYm(month)) {
      return formatMonthLabel(month);
    }
    if (preset === "year" && isYear(year)) {
      return year;
    }
    if (preset === "custom" && isYmd(from) && isYmd(to)) {
      if (from === to) {
        return format(parse(from, "yyyy-MM-dd", new Date()), "d MMMM yyyy");
      }
      return `${format(parse(from, "yyyy-MM-dd", new Date()), "d MMM yyyy")} – ${format(
        parse(to, "yyyy-MM-dd", new Date()),
        "d MMM yyyy",
      )}`;
    }
  } catch {
    /* fall through */
  }
  return "Selected period";
}

function periodParamsValid(
  preset: Preset,
  date: string,
  month: string,
  year: string,
  from: string,
  to: string,
): { ok: true } | { ok: false; message?: string; soft?: boolean } {
  if (preset === "day") {
    if (!isYmd(date)) return { ok: false, soft: true };
    return { ok: true };
  }
  if (preset === "month") {
    if (!isYm(month)) return { ok: false, soft: true };
    return { ok: true };
  }
  if (preset === "year") {
    // Mid-edit years (2, 20, 202) — skip fetch quietly until complete.
    if (!isYear(year)) return { ok: false, soft: true };
    const y = Number(year);
    if (y < 2000 || y > 2100) {
      return { ok: false, message: "Year must be between 2000 and 2100" };
    }
    return { ok: true };
  }
  if (!isYmd(from) || !isYmd(to)) return { ok: false, soft: true };
  if (from > to) return { ok: false, message: "From must be on or before to" };
  if (daysBetweenKeys(from, to) > MAX_CUSTOM_DAYS) {
    return {
      ok: false,
      message: `Custom period cannot exceed ${MAX_CUSTOM_DAYS} days`,
    };
  }
  return { ok: true };
}

export default function FinancePage() {
  const { me, loading: authLoading } = useAuth();
  const isOwner = me?.role === "OWNER";
  const timeZone = me?.clinic.timezone || LAUNCH.timezone;
  const syncedTz = useRef<string | null>(null);
  const fetchGen = useRef(0);

  const initial = keysForTimezone(LAUNCH.timezone);
  const [preset, setPreset] = useState<Preset>("day");
  const [date, setDate] = useState(initial.date);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [periodReady, setPeriodReady] = useState(false);

  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      setPeriodReady(false);
      return;
    }
    const tz = me.clinic.timezone || LAUNCH.timezone;
    if (syncedTz.current === tz) {
      setPeriodReady(true);
      return;
    }
    syncedTz.current = tz;
    const next = keysForTimezone(tz);
    setDate(next.date);
    setMonth(next.month);
    setYear(next.year);
    setFrom(next.from);
    setTo(next.to);
    setPeriodReady(true);
  }, [authLoading, me]);

  const load = useCallback(
    (opts?: { showValidationErrors?: boolean }) => {
      if (!isOwner) return;
      const validity = periodParamsValid(preset, date, month, year, from, to);
      if (!validity.ok) {
        if (!validity.soft || opts?.showValidationErrors) {
          setError(validity.message ?? "Choose a valid period");
        }
        return;
      }

      const gen = ++fetchGen.current;
      setLoading(true);
      setError(null);
      setReport(null);

      const params = new URLSearchParams({ preset });
      if (preset === "day") params.set("date", date);
      if (preset === "month") params.set("month", month);
      if (preset === "year") params.set("year", year);
      if (preset === "custom") {
        params.set("from", from);
        params.set("to", to);
      }

      void api<RevenueReport>(`/finance/revenue?${params}`)
        .then((d) => {
          if (gen !== fetchGen.current) return;
          setReport(d);
        })
        .catch((e: Error) => {
          if (gen !== fetchGen.current) return;
          setReport(null);
          setError(e.message);
        })
        .finally(() => {
          if (gen !== fetchGen.current) return;
          setLoading(false);
        });
    },
    [isOwner, preset, date, month, year, from, to],
  );

  useEffect(() => {
    if (!periodReady || authLoading || !isOwner) return;
    load();
  }, [periodReady, authLoading, isOwner, load]);

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
  const showLoading =
    authLoading ||
    !periodReady ||
    loading ||
    (isOwner && !report && !error);
  const periodLabel = localPeriodLabel(preset, date, month, year, from, to);

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
            onClick={() => load({ showValidationErrors: true })}
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
                  onBlur={() => load({ showValidationErrors: true })}
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

        <p className="pay-hero-label">{periodLabel}</p>
        <p className="pay-hero-amount">
          {showLoading ? "…" : formatGbp(totals?.collectedCents ?? 0)}
        </p>
        <p className="pay-hero-meta muted">
          {showLoading
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
      {report?.truncated ? (
        <p className="alert-line">
          Totals include all {report.totals.paymentCount} payments. Breakdowns
          use the first {report.breakdownPaymentCount ?? 0} payments in the
          period — narrow the range for a full split.
        </p>
      ) : null}

      <div className="finance-totals">
        <div className="panel finance-total-card">
          <p className="muted">Deposits collected</p>
          <p className="finance-total-value">
            {showLoading ? "…" : formatGbp(totals?.depositsCents ?? 0)}
          </p>
          <p className="muted">
            {showLoading
              ? "…"
              : `${totals?.depositCount ?? 0} deposit${
                  (totals?.depositCount ?? 0) === 1 ? "" : "s"
                }`}
          </p>
        </div>
        <div className="panel finance-total-card">
          <p className="muted">Outstanding (all unpaid)</p>
          <p className="finance-total-value">
            {showLoading ? "…" : formatGbp(totals?.outstandingCents ?? 0)}
          </p>
          <p className="muted">
            {showLoading
              ? "…"
              : `${totals?.unpaidInvoiceCount ?? 0} invoice${
                  (totals?.unpaidInvoiceCount ?? 0) === 1 ? "" : "s"
                }`}
          </p>
        </div>
      </div>

      <div className="finance-grid">
        <BreakdownPanel
          title="By payment method"
          empty={
            showLoading ? "Loading…" : "No payments in this period."
          }
          rows={
            showLoading
              ? []
              : (report?.byMethod ?? []).map((r) => ({
                  key: r.method,
                  label: r.label,
                  meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
                  amountCents: r.amountCents,
                }))
          }
        />
        <BreakdownPanel
          title="By practitioner"
          empty={
            showLoading ? "Loading…" : "No payments linked to practitioners."
          }
          rows={
            showLoading
              ? []
              : (report?.byPractitioner ?? []).map((r) => ({
                  key: r.practitionerId ?? "none",
                  label: r.displayName,
                  meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
                  amountCents: r.amountCents,
                }))
          }
        />
        <BreakdownPanel
          title="By service"
          empty={showLoading ? "Loading…" : "No payments linked to services."}
          rows={
            showLoading
              ? []
              : (report?.byService ?? []).map((r) => ({
                  key: r.appointmentTypeId ?? "none",
                  label: r.name,
                  meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
                  amountCents: r.amountCents,
                }))
          }
        />
        {preset === "year" ? (
          <BreakdownPanel
            title="By month"
            empty={showLoading ? "Loading…" : "No payments in this year."}
            rows={
              showLoading
                ? []
                : (report?.byMonth ?? []).map((r) => ({
                    key: r.month,
                    label: formatMonthLabel(r.month),
                    meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
                    amountCents: r.amountCents,
                  }))
            }
          />
        ) : (
          <BreakdownPanel
            title="By day"
            empty={showLoading ? "Loading…" : "No payments in this period."}
            rows={
              showLoading
                ? []
                : (report?.byDay ?? []).map((r) => ({
                    key: r.date,
                    label: r.date,
                    meta: `${r.count} payment${r.count === 1 ? "" : "s"}`,
                    amountCents: r.amountCents,
                  }))
            }
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
