"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
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

export default function StaffPayPage() {
  const { me } = useAuth();
  const isOwner = me?.role === "OWNER";
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [rows, setRows] = useState<PayRow[]>([]);
  const [totals, setTotals] = useState({ sessionCount: 0, dueCents: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PayRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [employmentType, setEmploymentType] =
    useState<PayRate["employmentType"]>("SELF_EMPLOYED");
  const [payMode, setPayMode] = useState<PayRate["payMode"]>("SESSION");
  const [sessionRate, setSessionRate] = useState("40.00");
  const [dayRate, setDayRate] = useState("280.00");
  const [feeShare, setFeeShare] = useState("50");
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState("");

  const selected = rows.find((r) => r.practitioner.id === selectedId) ?? null;

  const loadSummary = useCallback(() => {
    if (!isOwner) return;
    void api<{
      rows: PayRow[];
      totals: { sessionCount: number; dueCents: number };
    }>(`/team/pay?month=${month}`)
      .then((d) => {
        setRows(d.rows);
        setTotals(d.totals);
        setSelectedId((prev) => {
          if (prev && d.rows.some((r) => r.practitioner.id === prev)) return prev;
          return d.rows[0]?.practitioner.id ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [isOwner, month]);

  const loadDetail = useCallback((id: string | null) => {
    if (!id || !isOwner) {
      setHistory([]);
      return;
    }
    void api<{ current: PayRate | null; history: PayRate[] }>(`/team/${id}/pay`)
      .then((d) => {
        setHistory(d.history);
        const cur = d.current;
        if (cur) {
          setEmploymentType(cur.employmentType);
          setPayMode(cur.payMode);
          setSessionRate(centsToPoundsInput(cur.sessionRateCents) || "40.00");
          setDayRate(centsToPoundsInput(cur.dayRateCents) || "280.00");
          setFeeShare(
            cur.feeSharePercent != null ? String(cur.feeSharePercent) : "50",
          );
          setEffectiveFrom(cur.effectiveFrom);
          setNotes(cur.notes ?? "");
        } else {
          setEmploymentType("SELF_EMPLOYED");
          setPayMode("SESSION");
          setSessionRate("40.00");
          setDayRate("280.00");
          setFeeShare("50");
          setEffectiveFrom(format(new Date(), "yyyy-MM-dd"));
          setNotes("");
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [isOwner]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function saveRate() {
    if (!selectedId || !isOwner) return;
    setBusy(true);
    setError(null);
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
      loadSummary();
      loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save pay terms");
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
        <div className="panel">
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
      subtitle="Employment type, rates, and a simple month summary — not full payroll."
    >
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Month summary</h2>
            <div className="home-cta">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Pay month"
              />
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => void downloadCsv()}
              >
                Export CSV
              </button>
            </div>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <p className="muted">
            Counts diary appointments (not cancelled / no-show). Fee share uses
            linked invoices, or the service list price if none. Patient billing
            remains on <Link href="/app/money">Money</Link>.
          </p>
          <ul className="apt-list">
            {rows.map((row) => (
              <li key={row.practitioner.id}>
                <button
                  type="button"
                  className={`apt-row team-row ${selectedId === row.practitioner.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(row.practitioner.id)}
                >
                  <div
                    className="room-swatch"
                    style={{ background: row.practitioner.colour }}
                    aria-hidden
                  />
                  <div className="apt-body">
                    <p className="apt-name">
                      {row.practitioner.displayName}
                      {!row.practitioner.active ? " · inactive" : ""}
                    </p>
                    <p className="muted">
                      {row.current
                        ? `${row.current.employmentType.replaceAll("_", " ").toLowerCase()} · ${row.current.payMode.toLowerCase().replaceAll("_", " ")}`
                        : "No pay terms set"}
                      {" · "}
                      {row.summary.sessionCount} sessions ·{" "}
                      {formatGbp(row.summary.dueCents)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="pay-total">
            <strong>Clinic total</strong>{" "}
            {totals.sessionCount} sessions · {formatGbp(totals.dueCents)}
          </p>
        </section>

        <section className="panel">
          <h2>Pay terms</h2>
          {selected ? (
            <>
              <p className="muted">
                Editing <strong>{selected.practitioner.displayName}</strong>
                {selected.practitioner.professionalTitle
                  ? ` · ${selected.practitioner.professionalTitle}`
                  : ""}
              </p>
              <label className="field">
                <span>Employment</span>
                <select
                  value={employmentType}
                  onChange={(e) =>
                    setEmploymentType(e.target.value as PayRate["employmentType"])
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
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void saveRate()}
              >
                {busy ? "Saving…" : "Save pay terms"}
              </button>

              {history.length ? (
                <>
                  <h3 className="pay-history-title">Rate history</h3>
                  <ul className="apt-list">
                    {history.map((h) => (
                      <li key={h.id} className="muted team-hours">
                        From {h.effectiveFrom}: {h.payMode.toLowerCase()}
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
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted">Select a practitioner.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
