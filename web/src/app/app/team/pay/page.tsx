"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addMonths, format, parse } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, getToken } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { LAUNCH } from "@/modules/config/brand";

type PayRate = {
  id: string;
  employmentType: "EMPLOYED" | "SELF_EMPLOYED" | "CONTRACTOR";
  payMode: "NONE" | "SESSION" | "DAY" | "FEE_SHARE";
  sessionRateCents: number | null;
  dayRateCents: number | null;
  feeSharePercent: number | null;
  effectiveFrom: string;
  notes: string | null;
};

type PayRow = {
  practitioner: {
    id: string;
    displayName: string;
    colour: string;
    active: boolean;
    professionalTitle: string | null;
  };
  current: PayRate | null;
  summary: {
    month: string;
    sessionCount: number;
    dayCount: number;
    feeBaseCents: number;
    dueCents: number;
  };
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat(LAUNCH.locale, {
    style: "currency",
    currency: LAUNCH.currency,
  }).format(pence / 100);
}

function poundsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function centsToPoundsInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function employmentLabel(v: PayRate["employmentType"]) {
  switch (v) {
    case "EMPLOYED":
      return "Employed";
    case "CONTRACTOR":
      return "Contractor";
    default:
      return "Self-employed";
  }
}

function payModeLabel(v: PayRate["payMode"] | null | undefined) {
  switch (v) {
    case "SESSION":
      return "Per session";
    case "DAY":
      return "Per day";
    case "FEE_SHARE":
      return "Fee share";
    case "NONE":
      return "Not tracked";
    default:
      return "No terms";
  }
}

function rateSummary(rate: PayRate | null) {
  if (!rate || rate.payMode === "NONE") return "No rate set";
  if (rate.payMode === "SESSION") {
    return `${formatGbp(rate.sessionRateCents ?? 0)} / session`;
  }
  if (rate.payMode === "DAY") {
    return `${formatGbp(rate.dayRateCents ?? 0)} / day`;
  }
  return `${rate.feeSharePercent ?? 0}% of fees`;
}

function dueBreakdown(row: PayRow) {
  const mode = row.current?.payMode;
  const s = row.summary;
  if (!mode || mode === "NONE") {
    return s.sessionCount
      ? `${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"} · no pay terms`
      : "No sessions this month";
  }
  if (mode === "DAY") {
    return `${s.dayCount} day${s.dayCount === 1 ? "" : "s"} · ${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"}`;
  }
  if (mode === "FEE_SHARE") {
    return `${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"} · fees ${formatGbp(s.feeBaseCents)}`;
  }
  return `${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"}`;
}

function monthLabel(month: string) {
  try {
    return format(parse(`${month}-01`, "yyyy-MM-dd", new Date()), "MMMM yyyy");
  } catch {
    return month;
  }
}

export default function StaffPayPage() {
  const { me } = useAuth();
  const isOwner = me?.role === "OWNER";
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [rows, setRows] = useState<PayRow[]>([]);
  const [totals, setTotals] = useState({ sessionCount: 0, dueCents: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PayRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [hasExistingTerms, setHasExistingTerms] = useState(false);

  const [employmentType, setEmploymentType] =
    useState<PayRate["employmentType"]>("SELF_EMPLOYED");
  const [payMode, setPayMode] = useState<PayRate["payMode"]>("SESSION");
  const [sessionRate, setSessionRate] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [feeShare, setFeeShare] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState("");

  const visibleRows = useMemo(
    () =>
      showInactive ? rows : rows.filter((r) => r.practitioner.active !== false),
    [rows, showInactive],
  );

  const selected =
    visibleRows.find((r) => r.practitioner.id === selectedId) ??
    rows.find((r) => r.practitioner.id === selectedId) ??
    null;

  const practitionersWithDue = useMemo(
    () => visibleRows.filter((r) => r.summary.dueCents > 0).length,
    [visibleRows],
  );

  const loadSummary = useCallback(() => {
    if (!isOwner) return;
    setLoadingSummary(true);
    setError(null);
    void api<{
      rows: PayRow[];
      totals: { sessionCount: number; dueCents: number };
    }>(`/team/pay?month=${month}`)
      .then((d) => {
        setRows(d.rows);
        setTotals(d.totals);
        setSelectedId((prev) => {
          const active = d.rows.filter((r) => r.practitioner.active);
          const pool = active.length ? active : d.rows;
          if (prev && d.rows.some((r) => r.practitioner.id === prev)) return prev;
          return pool[0]?.practitioner.id ?? null;
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingSummary(false));
  }, [isOwner, month]);

  const loadDetail = useCallback(
    (id: string | null) => {
      if (!id || !isOwner) {
        setHistory([]);
        setHasExistingTerms(false);
        return;
      }
      setLoadingDetail(true);
      setFormError(null);
      setMessage(null);
      void api<{ current: PayRate | null; history: PayRate[] }>(
        `/team/${id}/pay`,
      )
        .then((d) => {
          setHistory(d.history);
          const cur = d.current;
          setHasExistingTerms(Boolean(cur));
          if (cur) {
            setEmploymentType(cur.employmentType);
            setPayMode(cur.payMode);
            setSessionRate(centsToPoundsInput(cur.sessionRateCents));
            setDayRate(centsToPoundsInput(cur.dayRateCents));
            setFeeShare(
              cur.feeSharePercent != null ? String(cur.feeSharePercent) : "",
            );
            setEffectiveFrom(cur.effectiveFrom.slice(0, 10));
            setNotes(cur.notes ?? "");
          } else {
            setEmploymentType("SELF_EMPLOYED");
            setPayMode("SESSION");
            setSessionRate("");
            setDayRate("");
            setFeeShare("");
            setEffectiveFrom(format(new Date(), "yyyy-MM-dd"));
            setNotes("");
          }
        })
        .catch((e: Error) => setFormError(e.message))
        .finally(() => setLoadingDetail(false));
    },
    [isOwner],
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function shiftMonth(delta: number) {
    const next = addMonths(parse(`${month}-01`, "yyyy-MM-dd", new Date()), delta);
    setMonth(format(next, "yyyy-MM"));
  }

  async function saveRate() {
    if (!selectedId || !isOwner) return;
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      await api(`/team/${selectedId}/pay`, {
        method: "PUT",
        body: JSON.stringify({
          employmentType,
          payMode,
          sessionRateCents:
            payMode === "SESSION" ? poundsToCents(sessionRate) : null,
          dayRateCents: payMode === "DAY" ? poundsToCents(dayRate) : null,
          feeSharePercent:
            payMode === "FEE_SHARE" ? Number(feeShare) || 0 : null,
          effectiveFrom,
          notes: notes || null,
        }),
      });
      setMessage("Pay terms saved.");
      setHasExistingTerms(true);
      loadSummary();
      loadDetail(selectedId);
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : "Could not save pay terms",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv() {
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/v1/team/pay?month=${month}&format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("CSV export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staff-pay-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV export failed");
    }
  }

  if (!isOwner) {
    return (
      <AppShell title="Staff pay" subtitle="Owner only.">
        <div className="panel empty-panel">
          <p className="muted">
            Only clinic owners can view practitioner pay terms and month
            summaries. Patient invoices stay under{" "}
            <Link href="/app/money">Money</Link>.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Staff pay"
      subtitle="Month due by practitioner — set rates, then export when you settle."
    >
      <section className="panel pay-hero">
        <div className="pay-hero-top">
          <div className="pay-month-nav">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              ← Prev
            </button>
            <label className="pay-month-field">
              <span className="sr-only">Pay month</span>
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
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void downloadCsv()}
          >
            Export CSV
          </button>
        </div>

        <p className="pay-hero-label">{monthLabel(month)}</p>
        <p className="pay-hero-amount">
          {loadingSummary ? "…" : formatGbp(totals.dueCents)}
        </p>
        <p className="pay-hero-meta muted">
          {loadingSummary
            ? "Loading summary…"
            : `${totals.sessionCount} session${totals.sessionCount === 1 ? "" : "s"} · ${practitionersWithDue} practitioner${practitionersWithDue === 1 ? "" : "s"} due`}
        </p>
        <p className="pay-hero-hint muted">
          Counts diary appointments (not cancelled / no-show). Fee share uses
          linked invoices, or the service list price if none. Patient billing
          stays on <Link href="/app/money">Money</Link>.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <div className="pay-layout">
        <section className="panel pay-list-panel">
          <div className="panel-head">
            <h2>Practitioners</h2>
            <label className="consent-label pay-inactive-toggle">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span>Show inactive</span>
            </label>
          </div>

          {loadingSummary && rows.length === 0 ? (
            <p className="muted">Loading…</p>
          ) : null}

          {!loadingSummary && visibleRows.length === 0 ? (
            <div className="empty-panel">
              <p className="muted">
                No practitioners to show
                {showInactive ? "" : " (try showing inactive)"}. Add people under{" "}
                <Link href="/app/team">Team</Link>.
              </p>
            </div>
          ) : (
            <ul className="pay-list">
              {visibleRows.map((row) => {
                const selectedRow = selectedId === row.practitioner.id;
                return (
                  <li key={row.practitioner.id}>
                    <button
                      type="button"
                      className={`pay-row ${selectedRow ? "selected" : ""}`}
                      onClick={() => setSelectedId(row.practitioner.id)}
                    >
                      <span
                        className="pay-swatch"
                        style={{ background: row.practitioner.colour }}
                        aria-hidden
                      />
                      <span className="pay-row-main">
                        <span className="pay-row-name">
                          {row.practitioner.displayName}
                          {!row.practitioner.active ? (
                            <span className="pay-inactive-badge">Inactive</span>
                          ) : null}
                        </span>
                        <span className="pay-row-meta muted">
                          {payModeLabel(row.current?.payMode)} ·{" "}
                          {dueBreakdown(row)}
                        </span>
                      </span>
                      <span className="pay-row-due">
                        {formatGbp(row.summary.dueCents)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel pay-terms-panel">
          <h2>Pay terms</h2>
          {selected ? (
            <>
              <div className="pay-selected-head">
                <div>
                  <p className="pay-selected-name">
                    {selected.practitioner.displayName}
                  </p>
                  <p className="muted">
                    {selected.practitioner.professionalTitle
                      ? `${selected.practitioner.professionalTitle} · `
                      : ""}
                    {hasExistingTerms
                      ? `${employmentLabel(employmentType)} · ${rateSummary(selected.current)}`
                      : "No pay terms yet — set a mode and rate below"}
                  </p>
                </div>
                <div className="pay-selected-due">
                  <span className="muted">Due {monthLabel(month)}</span>
                  <strong>{formatGbp(selected.summary.dueCents)}</strong>
                </div>
              </div>

              {loadingDetail ? (
                <p className="muted">Loading terms…</p>
              ) : (
                <fieldset className="pay-terms-form" disabled={busy}>
                  <label className="field">
                    <span>Employment</span>
                    <select
                      value={employmentType}
                      onChange={(e) =>
                        setEmploymentType(
                          e.target.value as PayRate["employmentType"],
                        )
                      }
                    >
                      <option value="SELF_EMPLOYED">Self-employed</option>
                      <option value="EMPLOYED">Employed</option>
                      <option value="CONTRACTOR">Contractor</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Pay mode</span>
                    <select
                      value={payMode}
                      onChange={(e) =>
                        setPayMode(e.target.value as PayRate["payMode"])
                      }
                    >
                      <option value="NONE">None / not tracked</option>
                      <option value="SESSION">Per session</option>
                      <option value="DAY">Per day</option>
                      <option value="FEE_SHARE">% of appointment fee</option>
                    </select>
                  </label>
                  {payMode === "SESSION" ? (
                    <label className="field">
                      <span>Session rate (£)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="e.g. 40.00"
                        value={sessionRate}
                        onChange={(e) => setSessionRate(e.target.value)}
                      />
                    </label>
                  ) : null}
                  {payMode === "DAY" ? (
                    <label className="field">
                      <span>Day rate (£)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="e.g. 280.00"
                        value={dayRate}
                        onChange={(e) => setDayRate(e.target.value)}
                      />
                    </label>
                  ) : null}
                  {payMode === "FEE_SHARE" ? (
                    <label className="field">
                      <span>Fee share (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        inputMode="numeric"
                        placeholder="e.g. 50"
                        value={feeShare}
                        onChange={(e) => setFeeShare(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Effective from</span>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional — e.g. associate agreement"
                    />
                  </label>

                  {formError ? <p className="form-error">{formError}</p> : null}
                  {message ? <p className="alert-line">{message}</p> : null}

                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void saveRate()}
                  >
                    {busy ? "Saving…" : "Save pay terms"}
                  </button>
                </fieldset>
              )}

              {history.length ? (
                <>
                  <h3 className="pay-history-title">Rate history</h3>
                  <ul className="pay-history-list">
                    {history.map((h) => (
                      <li key={h.id}>
                        <span className="pay-history-date">
                          From{" "}
                          {format(
                            parse(
                              h.effectiveFrom.slice(0, 10),
                              "yyyy-MM-dd",
                              new Date(),
                            ),
                            "d MMM yyyy",
                          )}
                        </span>
                        <span className="muted">
                          {employmentLabel(h.employmentType)} ·{" "}
                          {payModeLabel(h.payMode)}
                          {h.payMode === "SESSION"
                            ? ` · ${formatGbp(h.sessionRateCents ?? 0)}/session`
                            : ""}
                          {h.payMode === "DAY"
                            ? ` · ${formatGbp(h.dayRateCents ?? 0)}/day`
                            : ""}
                          {h.payMode === "FEE_SHARE"
                            ? ` · ${h.feeSharePercent ?? 0}%`
                            : ""}
                          {h.notes ? ` — ${h.notes}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted">Select a practitioner to set pay terms.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
