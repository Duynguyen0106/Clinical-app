"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { BRAND } from "@/modules/config/brand";
import { api, ApiError } from "@/lib/api";

type Clinic = {
  id: string;
  name: string;
  slug: string;
  appointmentTypes: { id: string; name: string; durationMinutes: number }[];
  practitioners: ({ id: string; displayName: string } | null)[];
};

type Props = { params: Promise<{ slug: string }> };

export default function BookingPage({ params }: Props) {
  const { slug } = use(params);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [practitionerId, setPractitionerId] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [step, setStep] = useState<"pick" | "details" | "done">("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [recordingPref, setRecordingPref] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ clinic: Clinic }>(`/public/clinics/${slug}`, { auth: false })
      .then((d) => {
        setClinic(d.clinic);
        setServiceId(d.clinic.appointmentTypes[0]?.id ?? "");
        const prac = d.clinic.practitioners.filter(Boolean)[0];
        setPractitionerId(prac?.id ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  useEffect(() => {
    if (!serviceId || !practitionerId) return;
    void api<{ slots: string[] }>(
      `/public/clinics/${slug}/slots?appointmentTypeId=${serviceId}&practitionerId=${practitionerId}`,
      { auth: false },
    ).then((d) => {
      setSlots(d.slots);
      setSlot(d.slots[0] ?? "");
    });
  }, [slug, serviceId, practitionerId]);

  async function confirm() {
    if (!clinic || !privacy) return;
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ") || "Patient";
    setBusy(true);
    setError(null);
    try {
      await api(`/public/clinics/${slug}`, {
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
        }),
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="book-page">
        <div className="book-card">
          <p className="brand-mark">{BRAND.shortName}</p>
          <h1>You&apos;re booked</h1>
          <p className="muted">
            {name} · {format(new Date(slot), "EEE d MMM HH:mm")}
          </p>
          <p>
            A confirmation email is on its way to {email}. We&apos;ll also send
            a reminder before your visit.
          </p>
          <Link href="/login" className="btn-primary">
            Clinic sign in
          </Link>
        </div>
      </div>
    );
  }

  const practitioners = (clinic?.practitioners ?? []).filter(Boolean) as {
    id: string;
    displayName: string;
  }[];

  return (
    <div className="book-page">
      <div className="book-card">
        <p className="brand-mark">{clinic?.name ?? slug}</p>
        <h1>Book online</h1>
        <p className="muted">
          Physio, osteopathy, and manual therapy — short intake, then confirm.
        </p>
        {error ? <p className="form-error">{error}</p> : null}

        {step === "pick" && clinic && (
          <>
            <label className="field">
              <span>Service</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {clinic.appointmentTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes} min)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Practitioner</span>
              <select
                value={practitionerId}
                onChange={(e) => setPractitionerId(e.target.value)}
              >
                {practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="slot-fieldset">
              <legend>Next available</legend>
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`slot ${slot === s ? "selected" : ""}`}
                    onClick={() => setSlot(s)}
                  >
                    {format(new Date(s), "EEE d MMM HH:mm")}
                  </button>
                ))}
              </div>
              {slots.length === 0 ? (
                <p className="muted">No open slots in the next fortnight.</p>
              ) : null}
            </fieldset>
            <button
              type="button"
              className="btn-primary"
              disabled={!slot}
              onClick={() => setStep("details")}
            >
              Continue to intake
            </button>
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
                I agree to the clinic privacy notice and processing of my
                health information for this appointment (UK GDPR).
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
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !name || !email || !privacy}
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
      </div>
    </div>
  );
}
