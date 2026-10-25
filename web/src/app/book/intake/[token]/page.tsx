"use client";

import { use, useEffect, useId, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/modules/config/brand";
import { api, ApiError } from "@/lib/api";

type IntakeForm = {
  status: string;
  treatmentConsentText: string;
  answers: {
    dateOfBirth?: string | null;
    emergencyPhone?: string | null;
    safetyNote?: string | null;
  };
  completedAt: string | null;
  signatureName: string | null;
  patient: {
    firstName: string;
    lastName: string;
    needsDateOfBirth: boolean;
  };
  clinic: {
    name: string;
    slug: string;
    brandColour: string | null;
    hasLogo: boolean;
    phone: string | null;
    logoUrl: string | null;
  };
  appointment: {
    startsAt: string;
    serviceName: string;
    practitionerName: string;
    inactive?: boolean;
  } | null;
};

type Props = { params: Promise<{ token: string }> };

type Step = "details" | "safety" | "consent";

const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "safety", label: "Safety" },
  { id: "consent", label: "Sign" },
];

export default function IntakeConsentPage({ params }: Props) {
  const { token: rawToken } = use(params);
  const token = decodeURIComponent(rawToken);
  const baseId = useId();
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [treatmentConsent, setTreatmentConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  useEffect(() => {
    void api<{ form: IntakeForm }>(
      `/public/intake?token=${encodeURIComponent(token)}`,
      { auth: false },
    )
      .then((d) => {
        setForm(d.form);
        if (d.form.status === "COMPLETED") {
          setDone(true);
          return;
        }
        setDateOfBirth(d.form.answers.dateOfBirth ?? "");
        // Only draft answers — never prefill from patient.phone (PHI / overwrite risk)
        setEmergencyPhone(d.form.answers.emergencyPhone ?? "");
        setSafetyNote(d.form.answers.safetyNote ?? "");
        // Empty signature — patient must type their name (attestation)
        setSignatureName("");
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const accent = form?.clinic.brandColour || BRAND.colours.forest;

  async function saveDraft() {
    try {
      await api("/public/intake", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          action: "draft",
          token,
          answers: {
            dateOfBirth: dateOfBirth || null,
            emergencyPhone: emergencyPhone.trim() || null,
            safetyNote: safetyNote.trim() || null,
          },
        }),
      });
    } catch {
      /* best-effort draft */
    }
  }

  async function complete() {
    if (!privacyConsent || !treatmentConsent) {
      setError("Please tick the required consent boxes");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/public/intake", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          action: "complete",
          token,
          answers: {
            dateOfBirth: dateOfBirth || null,
            emergencyPhone: emergencyPhone.trim() || null,
            safetyNote: safetyNote.trim() || null,
          },
          privacyConsent,
          treatmentConsent,
          marketingConsent,
          signatureName: signatureName.trim(),
        }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  function goToStep(next: Step) {
    setError(null);
    setStep(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  if (error && !form) {
    return (
      <main className="book-page">
        <div className="book-shell">
          <p className="form-error">{error}</p>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="book-page">
        <div className="book-shell">
          <p className="muted">Loading consent forms…</p>
        </div>
      </main>
    );
  }

  const registeredName = `${form.patient.firstName} ${form.patient.lastName}`.trim();

  return (
    <main className="book-page" style={{ ["--book-accent" as string]: accent }}>
      <div className="book-shell">
        <header className="book-brand">
          {form.clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.clinic.logoUrl} alt="" className="book-clinic-logo" />
          ) : (
            <BrandLogo />
          )}
          <p className="eyebrow book-clinic-name">{form.clinic.name}</p>
          <h1>Consent forms</h1>
          <p className="muted">
            A short pack before your visit — about 2 minutes. Not a full medical
            history; your practitioner will cover that with you in clinic.
          </p>
        </header>

        {form.appointment ? (
          <p className="muted">
            {form.appointment.serviceName} with{" "}
            {form.appointment.practitionerName} ·{" "}
            {new Date(form.appointment.startsAt).toLocaleString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {form.appointment.inactive
              ? " · This appointment is no longer active — you can still sign this pack"
              : ""}
          </p>
        ) : null}

        {done ? (
          <section className="panel">
            <h2>Thank you</h2>
            <p>
              Your consent pack is signed
              {form.signatureName || signatureName
                ? ` as ${form.signatureName ?? signatureName}`
                : ""}
              . See you at the clinic.
            </p>
            {form.clinic.phone ? (
              <p className="muted">Clinic phone: {form.clinic.phone}</p>
            ) : null}
          </section>
        ) : (
          <>
            <div
              className="view-toggle"
              role="tablist"
              aria-label="Consent steps"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const idx = STEPS.findIndex((s) => s.id === step);
                if (idx < 0) return;
                const next =
                  e.key === "ArrowRight"
                    ? STEPS[(idx + 1) % STEPS.length]
                    : STEPS[(idx - 1 + STEPS.length) % STEPS.length];
                if (!next) return;
                goToStep(next.id);
              }}
            >
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${s.id}`}
                  aria-selected={step === s.id}
                  aria-controls={`${baseId}-panel-${s.id}`}
                  tabIndex={step === s.id ? 0 : -1}
                  className={step === s.id ? "is-active" : undefined}
                  onClick={() => goToStep(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            {step === "details" ? (
              <section
                className="panel"
                id={`${baseId}-panel-details`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-details`}
              >
                <h2>Confirm details</h2>
                <p className="muted">{registeredName}</p>
                {form.patient.needsDateOfBirth || dateOfBirth ? (
                  <label className="field">
                    <span>Date of birth</span>
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>Emergency contact number</span>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="Optional — stored with this form only"
                    autoComplete="tel"
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    void saveDraft();
                    goToStep("safety");
                  }}
                >
                  Continue
                </button>
              </section>
            ) : null}

            {step === "safety" ? (
              <section
                className="panel"
                id={`${baseId}-panel-safety`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-safety`}
              >
                <h2>Anything we must know?</h2>
                <p className="muted">
                  Optional — allergies, medications, or other notes before
                  hands-on treatment. Full history is taken in clinic.
                </p>
                <label className="field">
                  <span>Safety notes</span>
                  <textarea
                    rows={4}
                    value={safetyNote}
                    onChange={(e) => setSafetyNote(e.target.value)}
                    placeholder="e.g. Penicillin allergy, blood thinners…"
                  />
                </label>
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => goToStep("details")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      void saveDraft();
                      goToStep("consent");
                    }}
                  >
                    Continue to sign
                  </button>
                </div>
              </section>
            ) : null}

            {step === "consent" ? (
              <section
                className="panel"
                id={`${baseId}-panel-consent`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-consent`}
              >
                <h2>Consents &amp; signature</h2>
                <div className="consent-copy">
                  <p>{form.treatmentConsentText}</p>
                </div>
                <label className="field checkbox-row">
                  <input
                    type="checkbox"
                    checked={treatmentConsent}
                    onChange={(e) => setTreatmentConsent(e.target.checked)}
                  />
                  <span>I agree to osteopathic assessment and treatment</span>
                </label>
                <label className="field checkbox-row">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                  />
                  <span>
                    I have read the{" "}
                    <Link href="/privacy" target="_blank" referrerPolicy="no-referrer">
                      privacy notice
                    </Link>
                  </span>
                </label>
                <label className="field checkbox-row">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                  />
                  <span>
                    Optional — send me clinic updates and appointment offers
                  </span>
                </label>
                <label className="field">
                  <span>Type your full name to sign</span>
                  <input
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    autoComplete="off"
                    placeholder={registeredName}
                    aria-describedby={`${baseId}-sig-hint`}
                  />
                </label>
                <p id={`${baseId}-sig-hint`} className="muted">
                  Include your registered name ({registeredName}). Middle names
                  are fine.
                </p>
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => goToStep("safety")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      busy ||
                      !privacyConsent ||
                      !treatmentConsent ||
                      signatureName.trim().length < 2
                    }
                    onClick={() => void complete()}
                  >
                    {busy ? "Saving…" : "Sign and submit"}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
