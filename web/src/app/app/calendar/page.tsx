"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDays,
  format,
  setHours,
  setMinutes,
  startOfWeek,
} from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  patient: { id: string; firstName: string; lastName: string };
  practitioner: { id: string; displayName: string };
  appointmentType: {
    id: string;
    name: string;
    durationMinutes: number;
    defaultPriceCents: number;
  };
  room: { name: string } | null;
  visit: { id: string } | null;
};

type Block = {
  id: string;
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  practitioner: { id: string; displayName: string };
};

type Catalog = {
  appointmentTypes: {
    id: string;
    name: string;
    durationMinutes: number;
    defaultPriceCents: number;
  }[];
  practitioners: { id: string; displayName: string }[];
};

type Patient = { id: string; firstName: string; lastName: string };

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function minutesLabel(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function durationOf(apt: Appointment) {
  return Math.round(
    (new Date(apt.endsAt).getTime() - new Date(apt.startsAt).getTime()) /
      60_000,
  );
}

export default function CalendarPage() {
  const { me } = useAuth();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Appointment | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const [bookPatientId, setBookPatientId] = useState("");
  const [bookTypeId, setBookTypeId] = useState("");
  const [bookPractitionerId, setBookPractitionerId] = useState("");
  const [bookDuration, setBookDuration] = useState(30);
  const [bookFeePounds, setBookFeePounds] = useState("");
  const [bookSlots, setBookSlots] = useState<string[]>([]);
  const [bookSlot, setBookSlot] = useState("");
  const [bookNotes, setBookNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [blockPractitionerId, setBlockPractitionerId] = useState("");
  const [blockDate, setBlockDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockReason, setBlockReason] = useState("");

  const [editDuration, setEditDuration] = useState(30);
  const [extraFee, setExtraFee] = useState("");
  const [feeNote, setFeeNote] = useState("");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(() => {
    const from = weekStart;
    const to = addDays(weekStart, 7);
    void Promise.all([
      api<{ appointments: Appointment[] }>(
        `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
      api<{ blocks: Block[] }>(
        `/blocks?from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`,
      ),
    ])
      .then(([a, b]) => {
        setAppointments(a.appointments);
        setBlocks(b.blocks);
      })
      .catch((e: Error) => setError(e.message));
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void api<Catalog>("/clinic/catalog")
      .then((c) => {
        setCatalog(c);
        setBookTypeId(c.appointmentTypes[0]?.id ?? "");
        setBookPractitionerId(c.practitioners[0]?.id ?? "");
        setBlockPractitionerId(c.practitioners[0]?.id ?? "");
        setBookDuration(c.appointmentTypes[0]?.durationMinutes ?? 30);
        const fee = c.appointmentTypes[0]?.defaultPriceCents ?? 0;
        setBookFeePounds(fee ? (fee / 100).toFixed(2) : "");
      })
      .catch(() => undefined);
    void api<{ patients: Patient[] }>("/patients?take=50")
      .then((d) => {
        setPatients(d.patients);
        setBookPatientId(d.patients[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!bookOpen || !bookTypeId || !bookPractitionerId) return;
    void api<{ slots: string[] }>(
      `/slots?appointmentTypeId=${bookTypeId}&practitionerId=${bookPractitionerId}&durationMinutes=${bookDuration}&days=14`,
    )
      .then((d) => {
        setBookSlots(d.slots);
        setBookSlot(d.slots[0] ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, [bookOpen, bookTypeId, bookPractitionerId, bookDuration]);

  useEffect(() => {
    if (!selected) return;
    setEditDuration(durationOf(selected));
    setExtraFee("");
    setFeeNote("");
  }, [selected]);

  async function reschedule(id: string, day: Date, hour: number) {
    const startsAt = setMinutes(setHours(day, hour), 0);
    try {
      await api(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startsAt: startsAt.toISOString() }),
      });
      setError(null);
      setMessage("Appointment moved");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reschedule");
    }
  }

  async function createBooking() {
    if (!bookPatientId || !bookSlot) return;
    setBusy(true);
    setError(null);
    try {
      const feeCents = bookFeePounds
        ? Math.round(Number(bookFeePounds) * 100)
        : 0;
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          patientId: bookPatientId,
          practitionerId: bookPractitionerId,
          appointmentTypeId: bookTypeId,
          startsAt: bookSlot,
          durationMinutes: bookDuration,
          notes: bookNotes || null,
          feeCents: feeCents > 0 ? feeCents : undefined,
        }),
      });
      setBookOpen(false);
      setMessage("Appointment booked");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  async function createBlock() {
    setBusy(true);
    setError(null);
    try {
      const [sh, sm] = blockStart.split(":").map(Number);
      const [eh, em] = blockEnd.split(":").map(Number);
      await api("/blocks", {
        method: "POST",
        body: JSON.stringify({
          practitionerId: blockPractitionerId,
          date: blockDate,
          startMinute: blockAllDay ? null : sh * 60 + sm,
          endMinute: blockAllDay ? null : eh * 60 + em,
          reason: blockReason || null,
        }),
      });
      setBlockOpen(false);
      setMessage("Time blocked");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not block time");
    } finally {
      setBusy(false);
    }
  }

  async function patchSelected(body: Record<string, unknown>, okMsg: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ appointment: Appointment }>(
        `/appointments/${selected.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setSelected(res.appointment);
      setMessage(okMsg);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function openVisit(apt: Appointment) {
    if (apt.visit) {
      router.push(`/app/visits/${apt.visit.id}`);
      return;
    }
    const { visit } = await api<{ visit: { id: string } }>("/visits", {
      method: "POST",
      body: JSON.stringify({ appointmentId: apt.id }),
    });
    router.push(`/app/visits/${visit.id}`);
  }

  return (
    <AppShell
      title="Calendar"
      subtitle="Book, block time, drag to reschedule, or open an appointment to adjust length and fees."
    >
      <div className="panel calendar-panel">
        <div className="panel-head week-toolbar">
          <div className="week-nav">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              ← Prev
            </button>
            <h2>
              {format(weekStart, "d MMM")} –{" "}
              {format(addDays(weekStart, 6), "d MMM yyyy")}
            </h2>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            >
              Next →
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
            >
              This week
            </button>
          </div>
          <div className="week-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setBookOpen(true)}
            >
              Book
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setBlockOpen(true)}
            >
              Block time
            </button>
            <Link
              href={`/book/${me?.clinic.slug ?? "northbank-manual"}`}
              className="btn-ghost"
            >
              Online booking
            </Link>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-ok">{message}</p> : null}

        <div className="week-grid" role="grid" aria-label="Week calendar">
          <div className="week-corner" />
          {days.map((day) => (
            <div key={day.toISOString()} className="week-day-head">
              <strong>{format(day, "EEE")}</strong>
              <span>{format(day, "d MMM")}</span>
            </div>
          ))}

          {HOURS.map((hour) => (
            <div key={hour} className="week-hour-row">
              <div className="week-hour">{`${String(hour).padStart(2, "0")}:00`}</div>
              {days.map((day) => {
                const cellAppts = appointments.filter((a) => {
                  const s = new Date(a.startsAt);
                  return (
                    s.getFullYear() === day.getFullYear() &&
                    s.getMonth() === day.getMonth() &&
                    s.getDate() === day.getDate() &&
                    s.getHours() === hour
                  );
                });
                const dayKey = format(day, "yyyy-MM-dd");
                const cellBlocks = blocks.filter((b) => {
                  const bDate = b.date.slice(0, 10);
                  if (bDate !== dayKey) return false;
                  if (b.startMinute == null) return hour >= 8 && hour < 18;
                  const hStart = Math.floor((b.startMinute ?? 0) / 60);
                  const hEnd = Math.ceil((b.endMinute ?? 24 * 60) / 60);
                  return hour >= hStart && hour < hEnd;
                });
                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`week-cell ${draggingId ? "droppable" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id =
                        e.dataTransfer.getData("text/appointment-id") ||
                        draggingId;
                      if (id) void reschedule(id, day, hour);
                      setDraggingId(null);
                    }}
                  >
                    {cellBlocks.map((b) => (
                      <div key={b.id} className="cal-block" title={b.reason ?? "Blocked"}>
                        Blocked
                        {b.reason ? ` · ${b.reason}` : ""}
                      </div>
                    ))}
                    {cellAppts.map((apt) => (
                      <button
                        key={apt.id}
                        type="button"
                        className="cal-event week-event"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "text/appointment-id",
                            apt.id,
                          );
                          setDraggingId(apt.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => {
                          setMessage(null);
                          setSelected(apt);
                        }}
                        title="Click for actions · drag to reschedule"
                      >
                        <strong>
                          {apt.patient.firstName} {apt.patient.lastName}
                        </strong>
                        <span>{apt.appointmentType.name}</span>
                        {apt.room ? (
                          <span className="cal-room">{apt.room.name}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Appointment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>
                {selected.patient.firstName} {selected.patient.lastName}
              </h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <p className="muted">
              {format(new Date(selected.startsAt), "EEE d MMM HH:mm")} ·{" "}
              {durationOf(selected)} min · {selected.appointmentType.name}
              {selected.room ? ` · ${selected.room.name}` : ""}
            </p>
            <p className="muted">Status: {selected.status}</p>

            <div className="sheet-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void openVisit(selected)}
              >
                Open visit
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || selected.status === "CANCELLED"}
                onClick={() =>
                  void patchSelected({ status: "CANCELLED" }, "Cancelled")
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || selected.status === "NO_SHOW"}
                onClick={() =>
                  void patchSelected({ status: "NO_SHOW" }, "Marked no-show")
                }
              >
                No-show
              </button>
            </div>

            <label className="field">
              <span>Length (minutes)</span>
              <div className="inline-row">
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void patchSelected(
                      { durationMinutes: editDuration },
                      "Length updated",
                    )
                  }
                >
                  Save length
                </button>
              </div>
            </label>

            <label className="field">
              <span>Additional fee (£)</span>
              <div className="inline-row">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 15"
                  value={extraFee}
                  onChange={(e) => setExtraFee(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Reason (tape, injection…)"
                  value={feeNote}
                  onChange={(e) => setFeeNote(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy || !extraFee || Number(extraFee) <= 0}
                  onClick={() =>
                    void patchSelected(
                      {
                        additionalFeeCents: Math.round(Number(extraFee) * 100),
                        feeNote: feeNote || undefined,
                      },
                      "Fee added",
                    )
                  }
                >
                  Add fee
                </button>
              </div>
            </label>

            {selected.notes ? (
              <p className="muted sheet-notes">{selected.notes}</p>
            ) : null}

            <PatientPrepPanel
              patientId={selected.patient.id}
              excludeAppointmentId={selected.id}
              compact
              source="calendar"
            />

            {blocks.some((b) => b.practitioner.id === selected.practitioner.id) ? (
              <div className="block-list">
                <h3>Blocks this week</h3>
                {blocks
                  .filter((b) => b.practitioner.id === selected.practitioner.id)
                  .map((b) => (
                    <div key={b.id} className="block-row">
                      <span>
                        {b.date.slice(0, 10)}{" "}
                        {b.startMinute == null
                          ? "all day"
                          : `${minutesLabel(b.startMinute)}–${minutesLabel(b.endMinute ?? 0)}`}
                        {b.reason ? ` · ${b.reason}` : ""}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() =>
                          void api(`/blocks/${b.id}`, { method: "DELETE" }).then(
                            () => {
                              setMessage("Block removed");
                              load();
                            },
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {bookOpen ? (
        <div className="sheet-backdrop" onClick={() => setBookOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Book appointment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>Book appointment</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setBookOpen(false)}
              >
                Close
              </button>
            </div>
            <label className="field">
              <span>Patient</span>
              <select
                value={bookPatientId}
                onChange={(e) => setBookPatientId(e.target.value)}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Service</span>
              <select
                value={bookTypeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBookTypeId(id);
                  const t = catalog?.appointmentTypes.find((x) => x.id === id);
                  if (t) {
                    setBookDuration(t.durationMinutes);
                    setBookFeePounds(
                      t.defaultPriceCents
                        ? (t.defaultPriceCents / 100).toFixed(2)
                        : "",
                    );
                  }
                }}
              >
                {catalog?.appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.durationMinutes} min)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Practitioner</span>
              <select
                value={bookPractitionerId}
                onChange={(e) => setBookPractitionerId(e.target.value)}
              >
                {catalog?.practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Length (minutes)</span>
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={bookDuration}
                onChange={(e) => setBookDuration(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Fee (£) — optional invoice</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={bookFeePounds}
                onChange={(e) => setBookFeePounds(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Slot</span>
              <select
                value={bookSlot}
                onChange={(e) => setBookSlot(e.target.value)}
              >
                {bookSlots.length === 0 ? (
                  <option value="">No open slots</option>
                ) : (
                  bookSlots.map((s) => (
                    <option key={s} value={s}>
                      {format(new Date(s), "EEE d MMM HH:mm")}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={bookNotes}
                onChange={(e) => setBookNotes(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !bookSlot || !bookPatientId}
              onClick={() => void createBooking()}
            >
              {busy ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </div>
      ) : null}

      {blockOpen ? (
        <div className="sheet-backdrop" onClick={() => setBlockOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Block time"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>Block time</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setBlockOpen(false)}
              >
                Close
              </button>
            </div>
            <label className="field">
              <span>Practitioner</span>
              <select
                value={blockPractitionerId}
                onChange={(e) => setBlockPractitionerId(e.target.value)}
              >
                {catalog?.practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={blockAllDay}
                onChange={(e) => setBlockAllDay(e.target.checked)}
              />
              <span>All day</span>
            </label>
            {!blockAllDay ? (
              <div className="inline-row">
                <label className="field">
                  <span>From</span>
                  <input
                    type="time"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="time"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <label className="field">
              <span>Reason</span>
              <input
                type="text"
                placeholder="Lunch, admin, leave…"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void createBlock()}
            >
              {busy ? "Saving…" : "Save block"}
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
