"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type ClinicCompliance = {
  id: string;
  name?: string;
  audioRetentionDays: number;
  privacyNoticeVersion: string;
  dataRegion: string;
};

type SupportInfo = {
  email: string;
  appBaseUrl: string;
  privacyPath: string;
};

type BookingPolicy = {
  bookingMinNoticeHours: number;
  bookingMaxAdvanceDays: number;
  cancelMinNoticeHours: number;
  depositMode: "OFF" | "ALL_ONLINE" | "NEW_PATIENTS";
  depositDefaultCents: number;
  bookingPolicyText: string;
};

export default function SettingsPage() {
  const { me } = useAuth();
  const [clinic, setClinic] = useState<ClinicCompliance | null>(null);
  const [support, setSupport] = useState<SupportInfo | null>(null);
  const [booking, setBooking] = useState<BookingPolicy | null>(null);
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{ clinic: ClinicCompliance }>("/clinic/compliance"),
      api<{ support: SupportInfo }>("/ops/support"),
      api<{ booking: BookingPolicy }>("/clinic/booking"),
    ])
      .then(([c, s, b]) => {
        setClinic(c.clinic);
        setDays(c.clinic.audioRetentionDays);
        setSupport(s.support);
        setBooking(b.booking);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save() {
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ clinic: ClinicCompliance }>("/clinic/compliance", {
        method: "PATCH",
        body: JSON.stringify({ audioRetentionDays: days }),
      });
      setClinic(d.clinic);
      setMessage("Saved retention settings.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  async function saveBooking() {
    if (!booking) return;
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ booking: BookingPolicy }>("/clinic/booking", {
        method: "PATCH",
        body: JSON.stringify(booking),
      });
      setBooking(d.booking);
      setMessage("Saved booking policy.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Booking policy save failed");
    }
  }

  async function runRetention() {
    setError(null);
    try {
      const d = await api<{ deleted: number }>("/jobs/retention", {
        method: "POST",
      });
      setMessage(`Purged ${d.deleted} expired audio recording(s).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Retention job failed");
    }
  }

  async function runReminders() {
    setError(null);
    try {
      const d = await api<{ sent: number }>("/jobs/reminders", {
        method: "POST",
      });
      setMessage(`Sent ${d.sent} reminder email(s).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Reminders failed");
    }
  }

  async function exportAudits() {
    setError(null);
    try {
      const d = await api<{ count: number; events: unknown[] }>(
        "/clinic/compliance?audits=1",
      );
      setAuditCount(d.count);
      const blob = new Blob([JSON.stringify(d, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `treow-access-audits-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(
        `Exported ${d.count} audit events (note views + patient prep access).`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed");
    }
  }

  const isOwner = me?.role === "OWNER";

  return (
    <AppShell
      title="Settings"
      subtitle="Compliance, audits, and launch support for this clinic."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Privacy & data</h2>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <p className="muted">
            Notice version: {clinic?.privacyNoticeVersion ?? "…"} · Region:{" "}
            {clinic?.dataRegion ?? "uk-eu"}
          </p>
          <Link href="/privacy" className="btn-ghost">
            View privacy notice →
          </Link>

          <label className="field" style={{ marginTop: "1rem" }}>
            <span>Audio retention (days)</span>
            <input
              type="number"
              min={0}
              max={365}
              value={days}
              disabled={!isOwner}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <p className="muted">
            Encrypted consultation audio is deleted after this many days. Signed
            notes and transcripts are kept.
          </p>
          {isOwner ? (
            <div className="home-cta">
              <button type="button" className="btn-primary" onClick={() => void save()}>
                Save
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void runRetention()}
              >
                Run retention now
              </button>
            </div>
          ) : (
            <p className="muted">Only clinic owners can change retention.</p>
          )}
        </section>

        <section className="panel">
          <h2>Online booking policy</h2>
          <p className="muted">
            Notice windows, how far ahead patients can book, and deposits (like
            Fresha-style no-show protection).
          </p>
          {booking ? (
            <>
              <label className="field">
                <span>Min notice to book (hours)</span>
                <input
                  type="number"
                  min={0}
                  max={168}
                  disabled={!isOwner}
                  value={booking.bookingMinNoticeHours}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      bookingMinNoticeHours: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Max advance book (days)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  disabled={!isOwner}
                  value={booking.bookingMaxAdvanceDays}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      bookingMaxAdvanceDays: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Online cancel / reschedule closes (hours before)</span>
                <input
                  type="number"
                  min={0}
                  max={168}
                  disabled={!isOwner}
                  value={booking.cancelMinNoticeHours}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      cancelMinNoticeHours: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Deposit mode</span>
                <select
                  disabled={!isOwner}
                  value={booking.depositMode}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      depositMode: e.target.value as BookingPolicy["depositMode"],
                    })
                  }
                >
                  <option value="OFF">Off</option>
                  <option value="NEW_PATIENTS">New patients (online)</option>
                  <option value="ALL_ONLINE">All online bookings</option>
                </select>
              </label>
              <label className="field">
                <span>Default deposit (£)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  disabled={!isOwner}
                  value={(booking.depositDefaultCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      depositDefaultCents: Math.round(
                        Number(e.target.value) * 100,
                      ),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Policy text (shown on booking)</span>
                <textarea
                  rows={3}
                  disabled={!isOwner}
                  value={booking.bookingPolicyText}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      bookingPolicyText: e.target.value,
                    })
                  }
                />
              </label>
              {isOwner ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void saveBooking()}
                >
                  Save booking policy
                </button>
              ) : (
                <p className="muted">Only owners can change booking policy.</p>
              )}
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </section>

        <section className="panel">
          <h2>Audit export</h2>
          <p className="muted">
            Download note access / edit / sign events for this clinic (JSON).
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void exportAudits()}
          >
            Export access audits
          </button>
          {auditCount !== null ? (
            <p className="muted">{auditCount} events in last export</p>
          ) : (
            <p className="muted">
              Includes note views and who opened patient prep / note history.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Launch support</h2>
          <p className="muted">
            For pilot incidents and privacy assistance. The clinic remains the
            data controller; Treow assists as processor.
          </p>
          <p>
            <strong>Support:</strong>{" "}
            <a href={`mailto:${support?.email ?? "support@treow.example"}`}>
              {support?.email ?? "…"}
            </a>
          </p>
          <p className="muted">
            App URL: {support?.appBaseUrl ?? "…"}
          </p>
          <div className="home-cta">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void runReminders()}
            >
              Send due reminders
            </button>
            <Link href="/privacy" className="btn-ghost">
              Privacy notice
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
