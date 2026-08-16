"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";

const SERVICES = [
  { id: "initial", name: "Initial assessment", minutes: 45 },
  { id: "followup", name: "Follow-up", minutes: 30 },
  { id: "review", name: "Review", minutes: 30 },
];

type Props = { params: Promise<{ slug: string }> };

export default function BookingPage({ params }: Props) {
  const { slug } = use(params);
  const clinicLabel =
    slug === "harbour-physio" ? "Harbour Physio" : slug.replace(/-/g, " ");

  const [serviceId, setServiceId] = useState(SERVICES[1].id);
  const [step, setStep] = useState<"pick" | "details" | "done">("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const slots = useMemo(
    () => ["Tomorrow 09:00", "Tomorrow 10:30", "Thu 14:00", "Fri 11:30"],
    [],
  );
  const [slot, setSlot] = useState(slots[0]);

  if (step === "done") {
    return (
      <div className="book-page">
        <div className="book-card">
          <p className="brand-mark">Aether</p>
          <h1>You&apos;re booked</h1>
          <p className="muted">
            {name || "Patient"} · {SERVICES.find((s) => s.id === serviceId)?.name}{" "}
            · {slot}
          </p>
          <p>A confirmation email would go to {email || "your inbox"}.</p>
          <Link href="/app" className="btn-primary">
            Clinic view
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="book-page">
      <div className="book-card">
        <p className="brand-mark">{clinicLabel}</p>
        <h1>Book online</h1>
        <p className="muted">
          Pick a service and time. Intake and consents stay short.
        </p>

        {step === "pick" && (
          <>
            <label className="field">
              <span>Service</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.minutes} min)
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
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setStep("details")}
            >
              Continue
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
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setStep("done")}
            >
              Confirm booking
            </button>
          </>
        )}
      </div>
    </div>
  );
}
