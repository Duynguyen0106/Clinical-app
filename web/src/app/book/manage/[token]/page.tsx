"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { api, ApiError } from "@/lib/api";

type Managed = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { firstName: string; lastName: string; email: string | null };
  practitioner: { displayName: string };
  appointmentType: { name: string; durationMinutes: number };
  room: { name: string } | null;
  clinic: { name: string; slug: string; timezone: string };
};

type Props = { params: Promise<{ token: string }> };

export default function ManageBookingPage({ params }: Props) {
  const { token: rawToken } = use(params);
  const token = decodeURIComponent(rawToken);
  const [appointment, setAppointment] = useState<Managed | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "reschedule">("view");

  function load() {
    void api<{ appointment: Managed; slots?: string[] }>(
      `/public/manage?token=${encodeURIComponent(token)}&slots=1`,
      { auth: false },
    )
      .then((d) => {
        setAppointment(d.appointment);
        setSlots(d.slots ?? []);
        setSlot(d.slots?.[0] ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, [token]);

  async function cancel() {
    if (!confirm("Cancel this appointment?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ appointment: Managed }>("/public/manage", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ action: "cancel", token }),
      });
      setAppointment(res.appointment);
      setMessage("Your appointment has been cancelled.");
      setMode("view");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ appointment: Managed }>("/public/manage", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ action: "reschedule", token, startsAt: slot }),
      });
      setAppointment(res.appointment);
      setMessage("Your appointment has been moved.");
      setMode("view");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reschedule");
    } finally {
      setBusy(false);
    }
  }

  const closed =
    appointment &&
    ["CANCELLED", "COMPLETED", "NO_SHOW", "IN_PROGRESS"].includes(
      appointment.status,
    );

  const availabilitySlots = useMemo(
    () => slots.map((startsAt) => ({ startsAt })),
    [slots],
  );

  return (
    <div className="book-page">
      <div className="book-shell">
        <div className="book-brand">
          <BrandLogo />
          <p className="brand-mark book-mark">{BRAND.shortName}</p>
        </div>
        <div className="book-card">
          <h1>Manage booking</h1>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-ok">{message}</p> : null}

          {!appointment && !error ? <p className="muted">Loading…</p> : null}

          {appointment ? (
            <>
              <p className="muted">{appointment.clinic.name}</p>
              <p>
                <strong>
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </strong>
              </p>
              <p>
                {format(
                  new Date(appointment.startsAt),
                  "EEEE d MMMM yyyy · HH:mm",
                )}
              </p>
              <p className="muted">
                {appointment.appointmentType.name} ·{" "}
                {appointment.practitioner.displayName}
                {appointment.room ? ` · ${appointment.room.name}` : ""}
              </p>
              <p className="muted">Status: {appointment.status}</p>

              {!closed && mode === "view" ? (
                <div className="sheet-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setMode("reschedule")}
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void cancel()}
                  >
                    Cancel appointment
                  </button>
                </div>
              ) : null}

              {!closed && mode === "reschedule" ? (
                <>
                  <AvailabilityPicker
                    slots={availabilitySlots}
                    value={slot}
                    onSelect={(s) => setSlot(s.startsAt)}
                    legend="Pick a new day and time"
                    emptyMessage="No other slots available."
                  />
                  {slot ? (
                    <p className="avail-selected muted">
                      Selected:{" "}
                      <strong>
                        {format(new Date(slot), "EEE d MMM · HH:mm")}
                      </strong>
                    </p>
                  ) : null}
                  <div className="sheet-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || !slot}
                      onClick={() => void reschedule()}
                    >
                      {busy ? "Saving…" : "Confirm new time"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setMode("view")}
                    >
                      Back
                    </button>
                  </div>
                </>
              ) : null}

              <p className="muted book-fineprint">
                Online cancel/reschedule closes within 2 hours of the visit.
                After that, please contact the clinic.
              </p>
              <Link
                href={`/book/${appointment.clinic.slug}`}
                className="btn-ghost"
              >
                Book another visit
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
