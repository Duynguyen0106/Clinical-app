"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { getWebsiteSnippets } from "@/modules/clinic/website";

type ClinicProfile = {
  id: string;
  name: string;
  slug?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  brandColour?: string | null;
  hasLogo?: boolean;
  logoUrl?: string | null;
  audioRetentionDays: number;
  privacyNoticeVersion: string;
  dataRegion: string;
  calendarPrivacyMode?: "FULL_NAME" | "INITIALS";
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
  depositBankAccountName?: string | null;
  depositBankSortCode?: string | null;
  depositBankAccountNumber?: string | null;
  bookingPolicyText: string;
};

type PatientEmailSettings = {
  appointmentRemindersEnabled: boolean;
  reminderHoursBefore: number;
  sameDayReminderEnabled: boolean;
  sameDayReminderHours: number;
  thankYouEnabled: boolean;
  thankYouDelayHours: number;
  reviewRequestEnabled: boolean;
  reviewRequestDelayDays: number;
  reviewUrl: string | null;
  noShowFollowUpEnabled: boolean;
  noShowFollowUpDelayHours: number;
};

export default function SettingsPage() {
  const router = useRouter();
  const { me, refresh, loading: authLoading } = useAuth();
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [support, setSupport] = useState<SupportInfo | null>(null);
  const [booking, setBooking] = useState<BookingPolicy | null>(null);
  const [patientEmails, setPatientEmails] =
    useState<PatientEmailSettings | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState(14);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [brandColour, setBrandColour] = useState("#1E3F37");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [calendarPrivacyMode, setCalendarPrivacyMode] = useState<
    "FULL_NAME" | "INITIALS"
  >("FULL_NAME");
  const [smsProvider, setSmsProvider] = useState<"console" | "twilio" | null>(
    null,
  );

  const website = useMemo(() => {
    if (!clinic?.slug || !support?.appBaseUrl) return null;
    return getWebsiteSnippets({
      appBaseUrl: support.appBaseUrl,
      slug: clinic.slug,
      clinicName: clinic.name,
      brandColour: brandColour || clinic.brandColour,
    });
  }, [clinic, support, brandColour]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy — select the text manually");
    }
  }

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role !== "OWNER") {
      router.replace("/app");
    }
  }, [authLoading, me, router]);

  useEffect(() => {
    void fetch("/api/v1/health")
      .then((r) => r.json())
      .then((d: { smsProvider?: "console" | "twilio" }) => {
        setSmsProvider(d.smsProvider ?? "console");
      })
      .catch(() => setSmsProvider("console"));
  }, []);

  useEffect(() => {
    void Promise.all([
      api<{ clinic: ClinicProfile }>("/clinic/profile"),
      api<{ support: SupportInfo }>("/ops/support"),
      api<{ booking: BookingPolicy }>("/clinic/booking"),
      api<{ patientEmails: PatientEmailSettings }>("/clinic/patient-emails"),
    ])
      .then(([c, s, b, pe]) => {
        setClinic(c.clinic);
        setName(c.clinic.name);
        setDays(c.clinic.audioRetentionDays);
        setPhone(c.clinic.phone ?? "");
        setEmail(c.clinic.email ?? "");
        setAddress(c.clinic.address ?? "");
        setBrandColour(c.clinic.brandColour ?? "#1E3F37");
        setCalendarPrivacyMode(
          c.clinic.calendarPrivacyMode === "INITIALS"
            ? "INITIALS"
            : "FULL_NAME",
        );
        setSupport(s.support);
        setBooking(b.booking);
        setPatientEmails(pe.patientEmails);
        if (c.clinic.hasLogo) {
          void loadLogoPreview();
        } else {
          setLogoPreview(null);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function loadLogoPreview() {
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("treow_token")
          : null;
      const res = await fetch("/api/v1/clinic/logo", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      setLogoPreview(URL.createObjectURL(blob));
    } catch {
      /* ignore */
    }
  }

  async function saveBrand() {
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ clinic: ClinicProfile }>("/clinic/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          phone: phone || null,
          email: email || null,
          address: address || null,
          brandColour: brandColour || null,
          calendarPrivacyMode,
        }),
      });
      setClinic(d.clinic);
      setCalendarPrivacyMode(
        d.clinic.calendarPrivacyMode === "INITIALS"
          ? "INITIALS"
          : "FULL_NAME",
      );
      setMessage("Saved clinic brand.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  async function saveRetention() {
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ clinic: ClinicProfile }>("/clinic/compliance", {
        method: "PATCH",
        body: JSON.stringify({ audioRetentionDays: days }),
      });
      setClinic((c) =>
        c
          ? { ...c, audioRetentionDays: d.clinic.audioRetentionDays }
          : c,
      );
      setMessage("Saved retention settings.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("logo", file);
      const d = await api<{ clinic: ClinicProfile }>("/clinic/logo", {
        method: "POST",
        body,
      });
      setClinic(d.clinic);
      await loadLogoPreview();
      setMessage("Clinic logo uploaded.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Logo upload failed");
    }
  }

  async function removeLogo() {
    setError(null);
    try {
      const d = await api<{ clinic: ClinicProfile }>("/clinic/logo", {
        method: "DELETE",
      });
      setClinic(d.clinic);
      setLogoPreview(null);
      setMessage("Clinic logo removed.");
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove logo");
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

  async function savePatientEmails() {
    if (!patientEmails) return;
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ patientEmails: PatientEmailSettings }>(
        "/clinic/patient-emails",
        {
          method: "PATCH",
          body: JSON.stringify(patientEmails),
        },
      );
      setPatientEmails(d.patientEmails);
      setMessage("Saved patient email automation.");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Patient email settings save failed",
      );
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

  async function runPatientEmails() {
    setError(null);
    try {
      const d = await api<{
        sent: number;
        thankYou: number;
        reviewRequest: number;
        noShowFollowUp: number;
        sameDayReminder: number;
        errors?: number;
      }>("/jobs/patient-emails", { method: "POST" });
      setMessage(
        `Patient emails sent: ${d.sent} (thank-you ${d.thankYou}, review ${d.reviewRequest}, no-show ${d.noShowFollowUp}, same-day ${d.sameDayReminder}${d.errors ? `, errors ${d.errors}` : ""}).`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Patient emails job failed");
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
        `Exported ${d.count} audit events (notes, prep access, schedule changes).`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed");
    }
  }

  const isOwner = me?.role === "OWNER";

  return (
    <AppShell
      title="Settings"
      subtitle="Clinic brand, booking policy, compliance, and launch support."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Clinic brand</h2>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <p className="muted">
            Logo, name, and letterhead appear on booking pages and printed notes.
          </p>

          <div className="clinic-brand-row">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview}
                alt="Clinic logo"
                className="clinic-logo-preview"
              />
            ) : (
              <div className="clinic-logo-preview muted">No logo</div>
            )}
            {isOwner ? (
              <div className="side-stack">
                <label className="field">
                  <span>Upload logo (PNG, JPEG, WebP, SVG · max 2MB)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) =>
                      void onLogoSelected(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {logoPreview ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => void removeLogo()}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <label className="field">
            <span>Clinic name</span>
            <input
              value={name}
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Brand colour</span>
            <input
              type="color"
              value={brandColour}
              disabled={!isOwner}
              onChange={(e) => setBrandColour(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Calendar privacy (open desk)</span>
            <select
              value={calendarPrivacyMode}
              disabled={!isOwner}
              onChange={(e) =>
                setCalendarPrivacyMode(
                  e.target.value === "INITIALS" ? "INITIALS" : "FULL_NAME",
                )
              }
            >
              <option value="FULL_NAME">Full patient names</option>
              <option value="INITIALS">
                Initials only on diary / Today (open desk)
              </option>
            </select>
            <p className="muted" style={{ marginTop: 6 }}>
              Initials mode redacts names and contact on schedule lists and the
              visit sheet. Patient directory and clinical notes stay full-name.
            </p>
          </label>
          {smsProvider === "console" ? (
            <p className="alert-line" role="status">
              SMS is in console mode — patient texts are logged on the server
              only, not delivered. Set{" "}
              <code>SMS_PROVIDER=twilio</code> with Twilio credentials for live
              SMS.
            </p>
          ) : null}
          <label className="field">
            <span>Address</span>
            <input
              value={address}
              disabled={!isOwner}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 Quayside, London"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              value={phone}
              disabled={!isOwner}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              disabled={!isOwner}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!email.trim() ? (
            <p className="form-error" role="status">
              Add a clinic email so new online bookings can notify reception.
              Without it, clinic booking notifications are skipped.
            </p>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void saveBrand()}
            >
              Save brand
            </button>
          ) : (
            <p className="muted">Only clinic owners can change brand settings.</p>
          )}
        </section>

        <section className="panel">
          <h2>Privacy & data</h2>
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
              <button
                type="button"
                className="btn-primary"
                onClick={() => void saveRetention()}
              >
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
            Fresha-style no-show protection). Manage service names, lengths, and
            prices under{" "}
            <Link href="/app/services">Services</Link>.
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
              <p className="muted">
                Bank transfer deposits (when the server has{" "}
                <code>PAYMENT_PROVIDER=bank_transfer</code>): patients see these
                details plus a unique reference. Reception marks the deposit paid
                on the diary when funds arrive. Leave blank if you use Stripe
                card Checkout instead.
              </p>
              <label className="field">
                <span>Deposit bank account name</span>
                <input
                  type="text"
                  disabled={!isOwner}
                  maxLength={120}
                  placeholder="Account name"
                  value={booking.depositBankAccountName ?? ""}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      depositBankAccountName: e.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Sort code</span>
                <input
                  type="text"
                  disabled={!isOwner}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="12-34-56"
                  value={booking.depositBankSortCode ?? ""}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      depositBankSortCode: e.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Account number</span>
                <input
                  type="text"
                  disabled={!isOwner}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="12345678"
                  value={booking.depositBankAccountNumber ?? ""}
                  onChange={(e) =>
                    setBooking({
                      ...booking,
                      depositBankAccountNumber: e.target.value,
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
          <h2>Patient emails</h2>
          <p className="muted">
            Opt-in automation via Resend. Requires{" "}
            <code>EMAIL_PROVIDER=resend</code> and hourly cron for reminders +
            patient-emails. Advance reminders, thank-you, review, and no-show
            follow-ups default <strong>off</strong> until you enable them.
            Thank-you / review only send for appointments marked{" "}
            <strong>Completed</strong> (diary “Mark completed” or after visit
            organise). Lookback: ~14 days thank-you, ~30 days review, ~7 days
            no-show. Review also needs a patient marketing consent on file.
          </p>
          {patientEmails ? (
            <>
              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={patientEmails.appointmentRemindersEnabled}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      appointmentRemindersEnabled: e.target.checked,
                    })
                  }
                />
                <span>Advance appointment reminders (email/SMS via cron)</span>
              </label>
              <label className="field">
                <span>Reminder hours before visit</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  disabled={
                    !isOwner || !patientEmails.appointmentRemindersEnabled
                  }
                  value={patientEmails.reminderHoursBefore}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      reminderHoursBefore: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={patientEmails.sameDayReminderEnabled}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      sameDayReminderEnabled: e.target.checked,
                    })
                  }
                />
                <span>
                  Same-day reminder (
                  <input
                    type="number"
                    min={1}
                    max={12}
                    disabled={!isOwner || !patientEmails.sameDayReminderEnabled}
                    style={{ width: "4rem" }}
                    value={patientEmails.sameDayReminderHours}
                    onChange={(e) =>
                      setPatientEmails({
                        ...patientEmails,
                        sameDayReminderHours: Number(e.target.value),
                      })
                    }
                  />{" "}
                  hours before)
                </span>
              </label>
              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={patientEmails.thankYouEnabled}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      thankYouEnabled: e.target.checked,
                    })
                  }
                />
                <span>
                  Thank-you after completed visit (delay{" "}
                  <input
                    type="number"
                    min={1}
                    max={168}
                    disabled={!isOwner || !patientEmails.thankYouEnabled}
                    style={{ width: "4rem" }}
                    value={patientEmails.thankYouDelayHours}
                    onChange={(e) =>
                      setPatientEmails({
                        ...patientEmails,
                        thankYouDelayHours: Number(e.target.value),
                      })
                    }
                  />{" "}
                  hours)
                </span>
              </label>
              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={patientEmails.reviewRequestEnabled}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      reviewRequestEnabled: e.target.checked,
                    })
                  }
                />
                <span>
                  Review request (
                  <input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!isOwner || !patientEmails.reviewRequestEnabled}
                    style={{ width: "3rem" }}
                    value={patientEmails.reviewRequestDelayDays}
                    onChange={(e) =>
                      setPatientEmails({
                        ...patientEmails,
                        reviewRequestDelayDays: Number(e.target.value),
                      })
                    }
                  />{" "}
                  days after visit)
                </span>
              </label>
              <label className="field">
                <span>Review URL (Google / Trustpilot)</span>
                <input
                  type="url"
                  disabled={!isOwner}
                  placeholder="https://g.page/r/…"
                  value={patientEmails.reviewUrl ?? ""}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      reviewUrl: e.target.value || null,
                    })
                  }
                />
                {patientEmails.reviewRequestEnabled &&
                !patientEmails.reviewUrl?.trim() ? (
                  <span className="muted">
                    Review requests stay off until you paste a review URL.
                  </span>
                ) : null}
              </label>
              <label className="field checkbox-row">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={patientEmails.noShowFollowUpEnabled}
                  onChange={(e) =>
                    setPatientEmails({
                      ...patientEmails,
                      noShowFollowUpEnabled: e.target.checked,
                    })
                  }
                />
                <span>
                  No-show follow-up (after{" "}
                  <input
                    type="number"
                    min={1}
                    max={168}
                    disabled={!isOwner || !patientEmails.noShowFollowUpEnabled}
                    style={{ width: "4rem" }}
                    value={patientEmails.noShowFollowUpDelayHours}
                    onChange={(e) =>
                      setPatientEmails({
                        ...patientEmails,
                        noShowFollowUpDelayHours: Number(e.target.value),
                      })
                    }
                  />{" "}
                  hours)
                </span>
              </label>
              {isOwner ? (
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void savePatientEmails()}
                  >
                    Save patient emails
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void runPatientEmails()}
                  >
                    Send due patient emails
                  </button>
                </div>
              ) : (
                <p className="muted">Only owners can change email automation.</p>
              )}
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </section>

        <section className="panel">
          <h2>Website booking</h2>
          <p className="muted">
            Part of Treow Clinic: put online booking on your website in minutes.
            We host the page; you paste a button or embed. No download required.
          </p>
          {website ? (
            <>
              <label className="field">
                <span>Public booking link</span>
                <div className="inline-row">
                  <input readOnly value={website.bookUrl} />
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void copyText("link", website.bookUrl)}
                  >
                    {copied === "link" ? "Copied" : "Copy"}
                  </button>
                </div>
              </label>
              <label className="field">
                <span>Book online button (HTML)</span>
                <textarea readOnly rows={6} value={website.buttonHtml} />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void copyText("button", website.buttonHtml)}
                >
                  {copied === "button" ? "Copied" : "Copy button HTML"}
                </button>
              </label>
              <label className="field">
                <span>Embed widget (iframe)</span>
                <textarea readOnly rows={7} value={website.iframeHtml} />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void copyText("iframe", website.iframeHtml)}
                >
                  {copied === "iframe" ? "Copied" : "Copy iframe HTML"}
                </button>
              </label>
              <p className="muted book-fineprint">
                WordPress / Squarespace / Wix: add a Custom HTML block and paste
                the iframe. Preview:{" "}
                <a href={website.embedUrl} target="_blank" rel="noreferrer">
                  open embed
                </a>
                .
              </p>
            </>
          ) : (
            <p className="muted">Loading clinic slug…</p>
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
