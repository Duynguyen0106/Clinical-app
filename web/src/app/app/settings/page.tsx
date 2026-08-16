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

export default function SettingsPage() {
  const { me } = useAuth();
  const [clinic, setClinic] = useState<ClinicCompliance | null>(null);
  const [support, setSupport] = useState<SupportInfo | null>(null);
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{ clinic: ClinicCompliance }>("/clinic/compliance"),
      api<{ support: SupportInfo }>("/ops/support"),
    ])
      .then(([c, s]) => {
        setClinic(c.clinic);
        setDays(c.clinic.audioRetentionDays);
        setSupport(s.support);
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
      a.download = `treow-note-audits-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${d.count} audit events.`);
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
          <h2>Audit export</h2>
          <p className="muted">
            Download note access / edit / sign events for this clinic (JSON).
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void exportAudits()}
          >
            Export note audits
          </button>
          {auditCount !== null ? (
            <p className="muted">{auditCount} events in last export</p>
          ) : null}
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
