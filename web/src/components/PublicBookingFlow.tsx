"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import {
  AvailabilityPicker,
  type AvailabilitySlot,
} from "@/components/AvailabilityPicker";
import {
  TurnstileField,
  turnstileEnabledInBrowser,
} from "@/components/TurnstileField";
import { api, ApiError } from "@/lib/api";

type Clinic = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  brandColour?: string | null;
  hasLogo?: boolean;
  logoUrl?: string | null;
  booking?: {
    minNoticeHours: number;
    maxAdvanceDays: number;
    cancelMinNoticeHours: number;
    depositMode: string;
    depositDefaultCents: number;
    policyText: string;
  };
  appointmentTypes: {
    id: string;
    name: string;
    durationMinutes: number;
    defaultPriceCents?: number;
    effectiveDepositCents?: number;
  }[];
  practitioners: ({ id: string; displayName: string } | null)[];
};

type Props = {
  slug: string;
  /** Compact chrome for iframe embeds on clinic websites */
  embed?: boolean;
};

export function PublicBookingFlow({ slug, embed = false }: Props) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  /** When browsing “any practitioner”, slots carry who is free. */
  const [anySlots, setAnySlots] = useState<
    { startsAt: string; practitionerId: string; practitionerName: string }[]
  >([]);
  const [anyMode, setAnyMode] = useState(true);
  const [slot, setSlot] = useState("");
  const [step, setStep] = useState<"pick" | "details" | "done">("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [recordingPref, setRecordingPref] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageHref, setManageHref] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = turnstileEnabledInBrowser();
  const [depositInfo, setDepositInfo] = useState<{
    status: string;
    depositCents: number;
    checkoutUrl: string | null;
  } | null>(null);
  const [policyText, setPolicyText] = useState<string | null>(null);

  useEffect(() => {
    void api<{ clinic: Clinic }>(`/public/clinics/${slug}`, { auth: false })
      .then((d) => {
        setClinic(d.clinic);
        setServiceId(d.clinic.appointmentTypes[0]?.id ?? "");
        const pracs = d.clinic.practitioners.filter(Boolean);
        setAnyMode(pracs.length > 1);
        setPractitionerId(pracs.length === 1 ? (pracs[0]?.id ?? "") : "");
        setPolicyText(d.clinic.booking?.policyText ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  useEffect(() => {
    if (!serviceId || !clinic || !anyMode) return;
    const pracs = (clinic.practitioners ?? []).filter(Boolean) as {
      id: string;
      displayName: string;
    }[];
    if (pracs.length < 2) return;
    let cancelled = false;
    void Promise.all(
      pracs.map((p) =>
        api<{ slots: string[] }>(
          `/public/clinics/${slug}/slots?appointmentTypeId=${serviceId}&practitionerId=${p.id}`,
          { auth: false },
        ).then((d) =>
          d.slots.map((startsAt) => ({
            startsAt,
            practitionerId: p.id,
            practitionerName: p.displayName,
          })),
        ),
      ),
    )
      .then((groups) => {
        if (cancelled) return;
        const merged = groups
          .flat()
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        setAnySlots(merged);
        setSlots([]);
        const first = merged[0];
        if (first) {
          setSlot(first.startsAt);
          setPractitionerId(first.practitionerId);
        } else {
          setSlot("");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, anyMode, clinic]);

  useEffect(() => {
    if (!serviceId || anyMode || !practitionerId) return;
    let cancelled = false;
    void api<{ slots: string[] }>(
      `/public/clinics/${slug}/slots?appointmentTypeId=${serviceId}&practitionerId=${practitionerId}`,
      { auth: false },
    )
      .then((d) => {
        if (cancelled) return;
        setSlots(d.slots);
        setAnySlots([]);
        setSlot(d.slots[0] ?? "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, practitionerId, anyMode]);

  async function confirm() {
    if (!clinic || !privacy) return;
    if (captchaRequired && !captchaToken) {
      setError("Complete the security check before booking.");
      return;
    }
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ") || "Patient";
    setBusy(true);
    setError(null);
    try {
      const booked = await api<{
        appointment: { id: string };
        manageUrl?: string;
        deposit?: {
          status: string;
          depositCents: number;
          checkoutUrl: string | null;
        } | null;
        policyText?: string;
      }>(`/public/clinics/${slug}`, {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          appointmentTypeId: serviceId,
          practitionerId,
          startsAt: slot,
          patient: { firstName, lastName, email, phone },
          intake: {
            reasonForVisit: reason || undefined,
            privacyConsent: true,
            recordingConsentPreferred: recordingPref,
          },
          captchaToken: captchaToken || undefined,
        }),
      });
      if (booked.manageUrl) setManageHref(booked.manageUrl);
      if (booked.deposit) setDepositInfo(booked.deposit);
      if (booked.policyText) setPolicyText(booked.policyText);
      if (booked.deposit?.checkoutUrl) {
        window.location.href = booked.deposit.checkoutUrl;
        return;
      }
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  const practitioners = (clinic?.practitioners ?? []).filter(Boolean) as {
    id: string;
    displayName: string;
  }[];

  const availabilitySlots: AvailabilitySlot[] = useMemo(() => {
    if (anyMode && anySlots.length > 0) {
      return anySlots.map((s) => ({
        startsAt: s.startsAt,
        practitionerId: s.practitionerId,
        practitionerName: s.practitionerName,
      }));
    }
    return slots.map((startsAt) => ({ startsAt }));
  }, [anyMode, anySlots, slots]);

  const shellClass = embed ? "book-page book-page-embed" : "book-page";
  const accent = clinic?.brandColour || undefined;
  const clinicLogo = clinic?.logoUrl ?? null;

  if (step === "done") {
    return (
      <div className={shellClass}>
        <div className="book-card">
          {!embed ? (
            clinicLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinicLogo} alt="" className="book-clinic-logo" />
            ) : (
              <p className="brand-mark">{BRAND.shortName}</p>
            )
          ) : null}
          <h1>You&apos;re booked</h1>
          <p className="muted">
            {name} · {format(new Date(slot), "EEE d MMM HH:mm")}
          </p>
          <p>
            A confirmation is on its way to {email}
            {phone ? " (and SMS if we have your number)" : ""} with a link to
            cancel or reschedule. We&apos;ll also send a reminder before your
            visit.
          </p>
          {depositInfo ? (
            <p className="alert-line">
              {depositInfo.status === "paid"
                ? `Deposit of £${(depositInfo.depositCents / 100).toFixed(2)} received — booking confirmed.`
                : `A deposit of £${(depositInfo.depositCents / 100).toFixed(2)} is required to hold this slot.`}
            </p>
          ) : null}
          {policyText ? <p className="muted book-fineprint">{policyText}</p> : null}
          {manageHref ? (
            <Link href={manageHref} className="btn-secondary">
              Manage this booking
            </Link>
          ) : null}
          {!embed ? (
            <Link href="/login" className="btn-primary">
              Clinic sign in
            </Link>
          ) : (
            <p className="muted embed-foot">You can close this window.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="book-shell">
        {!embed ? (
          <div className="book-brand">
            {clinicLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinicLogo} alt="" className="book-clinic-logo" />
            ) : (
              <BrandLogo variant="mark" className="book-mark" priority />
            )}
            <p
              className="brand-word"
              style={accent ? { color: accent } : undefined}
            >
              {clinic?.name ?? BRAND.shortName}
            </p>
            <p className="brand-motto">{BRAND.motto}</p>
          </div>
        ) : null}
        <div className="book-card">
          <p
            className="eyebrow"
            style={accent ? { color: accent } : undefined}
          >
            {clinic?.name ?? slug}
          </p>
          {clinic?.address || clinic?.phone ? (
            <p className="muted book-fineprint">
              {[clinic?.address, clinic?.phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <h1>Book online</h1>
          <p className="muted book-lead">
            Physio, osteopathy, and manual therapy — short intake, then confirm.
          </p>
          {error ? <p className="form-error">{error}</p> : null}

          {step === "pick" && clinic && (
            <>
              <div className="book-pick-row">
              <label className="field">
                <span>Service</span>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  {clinic.appointmentTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes} min
                      {s.defaultPriceCents != null && s.defaultPriceCents > 0
                        ? ` · £${(s.defaultPriceCents / 100).toFixed(2)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Practitioner</span>
                <select
                  value={anyMode ? "__any__" : practitionerId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__any__") {
                      setAnyMode(true);
                      setPractitionerId("");
                    } else {
                      setAnyMode(false);
                      setPractitionerId(v);
                    }
                  }}
                >
                  {practitioners.length > 1 ? (
                    <option value="__any__">Any available</option>
                  ) : null}
                  {practitioners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              </div>
              <AvailabilityPicker
                slots={availabilitySlots}
                value={slot}
                practitionerId={practitionerId}
                initialVisiblePerPeriod={4}
                onSelect={(s) => {
                  setSlot(s.startsAt);
                  if (s.practitionerId) setPractitionerId(s.practitionerId);
                }}
                legend="Availability"
              />
              {slot ? (
                <p className="avail-selected muted">
                  Selected:{" "}
                  <strong>
                    {format(new Date(slot), "EEE d MMM · HH:mm")}
                    {anyMode &&
                    practitioners.find((p) => p.id === practitionerId)
                      ? ` · ${practitioners.find((p) => p.id === practitionerId)?.displayName}`
                      : ""}
                  </strong>
                </p>
              ) : null}
              <div className="book-cta-bar">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!slot}
                  onClick={() => setStep("details")}
                >
                  Continue to intake
                </button>
              </div>
              {clinic.booking?.depositMode &&
              clinic.booking.depositMode !== "OFF" ? (
                <p className="muted book-fineprint">
                  A deposit of about £
                  {(
                    (clinic.appointmentTypes.find((t) => t.id === serviceId)
                      ?.effectiveDepositCents ??
                      clinic.booking.depositDefaultCents) / 100
                  ).toFixed(2)}{" "}
                  may be required
                  {clinic.booking.depositMode === "NEW_PATIENTS"
                    ? " for new patients"
                    : ""}
                  .
                </p>
              ) : null}
              {policyText ? (
                <p className="muted book-fineprint">{policyText}</p>
              ) : null}
            </>
          )}

          {step === "details" && (
            <>
              <label className="field">
                <span>Full name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </label>
              <label className="field">
                <span>Reason for visit (optional)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Right shoulder pain for 3 weeks"
                />
              </label>
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/privacy" target="_blank" rel="noreferrer">
                    clinic privacy notice
                  </Link>{" "}
                  and processing of my health information for this appointment
                  (UK GDPR).
                </span>
              </label>
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={recordingPref}
                  onChange={(e) => setRecordingPref(e.target.checked)}
                />
                <span>
                  I&apos;m happy for the clinician to record the consultation to
                  help write clinical notes (confirmed again at the visit).
                </span>
              </label>
              <TurnstileField onToken={setCaptchaToken} />
              <button
                type="button"
                className="btn-primary"
                disabled={
                  busy ||
                  !name ||
                  !email ||
                  !privacy ||
                  (captchaRequired && !captchaToken)
                }
                onClick={() => void confirm()}
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setStep("pick")}
              >
                Back
              </button>
            </>
          )}
          {embed ? (
            <p className="muted embed-powered">
              Booking powered by {BRAND.name}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
