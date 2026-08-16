"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Rule = {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

type Practitioner = {
  id: string;
  displayName: string;
  colour: string;
  active: boolean;
  professionalTitle?: string | null;
  registrationBody?: string | null;
  registrationNumber?: string | null;
  availability: Rule[];
  membership: {
    user: { email: string; name: string };
  };
};

type LeaveBlock = {
  id: string;
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  practitioner: { id: string; displayName: string };
};

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const COLOURS = ["#1E3F37", "#0F6B5C", "#1D4E89", "#7A3E2E", "#5B4B8A", "#3D5A40"];

function minutesToTime(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatRules(rules: Rule[]) {
  if (!rules.length) return "No hours set";
  return DAYS.filter((d) => rules.some((r) => r.dayOfWeek === d.value))
    .map((d) => {
      const dayRules = rules.filter((r) => r.dayOfWeek === d.value);
      return `${d.label} ${dayRules
        .map((r) => `${minutesToTime(r.startMinute)}–${minutesToTime(r.endMinute)}`)
        .join(", ")}`;
    })
    .join(" · ");
}

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function eachDateInclusive(from: string, to: string) {
  const out: string[] = [];
  let cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return out;
  if (cur > end) return out;
  while (cur <= end) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return out;
}

export default function TeamPage() {
  const { me } = useAuth();
  const isOwner = me?.role === "OWNER";
  const myProfileId = me?.practitionerProfileId ?? null;
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newReg, setNewReg] = useState("");
  const [busy, setBusy] = useState(false);

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editColour, setEditColour] = useState("#1E3F37");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editReg, setEditReg] = useState("");

  const [editDays, setEditDays] = useState<
    Record<number, { on: boolean; start: string; end: string }>
  >({});

  const [leaveBlocks, setLeaveBlocks] = useState<LeaveBlock[]>([]);
  const [leaveFrom, setLeaveFrom] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [leaveTo, setLeaveTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [leaveReason, setLeaveReason] = useState("Annual leave");
  const [leaveAllDay, setLeaveAllDay] = useState(true);
  const [leaveStart, setLeaveStart] = useState("09:00");
  const [leaveEnd, setLeaveEnd] = useState("17:00");

  const canEditSelected = useMemo(() => {
    if (!selectedId) return false;
    if (isOwner) return true;
    return Boolean(myProfileId && myProfileId === selectedId);
  }, [isOwner, myProfileId, selectedId]);

  const load = useCallback(() => {
    void api<{ practitioners: Practitioner[] }>("/team")
      .then((d) => {
        setPractitioners(d.practitioners);
        setSelectedId((prev) => {
          if (prev && d.practitioners.some((p) => p.id === prev)) return prev;
          if (myProfileId && d.practitioners.some((p) => p.id === myProfileId)) {
            return myProfileId;
          }
          return d.practitioners[0]?.id ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [myProfileId]);

  const loadLeave = useCallback((practitionerId: string | null) => {
    if (!practitionerId) {
      setLeaveBlocks([]);
      return;
    }
    const from = format(new Date(), "yyyy-MM-dd");
    const to = format(addDays(new Date(), 90), "yyyy-MM-dd");
    void api<{ blocks: LeaveBlock[] }>(
      `/blocks?from=${from}&to=${to}&practitionerId=${practitionerId}`,
    )
      .then((d) => setLeaveBlocks(d.blocks))
      .catch(() => setLeaveBlocks([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, []);

  const selected = practitioners.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setEditDisplayName(selected.displayName);
    setEditColour(selected.colour || "#1E3F37");
    setEditTitle(selected.professionalTitle ?? "");
    setEditBody(selected.registrationBody ?? "");
    setEditReg(selected.registrationNumber ?? "");
    const next: Record<number, { on: boolean; start: string; end: string }> =
      {};
    for (const d of DAYS) {
      const rule = selected.availability.find((r) => r.dayOfWeek === d.value);
      next[d.value] = {
        on: Boolean(rule),
        start: rule ? minutesToTime(rule.startMinute) : "09:00",
        end: rule ? minutesToTime(rule.endMinute) : "17:00",
      };
    }
    setEditDays(next);
    loadLeave(selected.id);
  }, [selected, loadLeave]);

  async function addPractitioner() {
    if (!isOwner) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ practitioner: Practitioner }>("/team", {
        method: "POST",
        body: JSON.stringify({
          email,
          name,
          displayName: displayName || name,
          password,
          professionalTitle: newTitle || null,
          registrationBody: newBody || null,
          registrationNumber: newReg || null,
        }),
      });
      setMessage(`Added ${d.practitioner.displayName}.`);
      setEmail("");
      setName("");
      setDisplayName("");
      setPassword("");
      setNewTitle("");
      setNewBody("");
      setNewReg("");
      setSelectedId(d.practitioner.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add practitioner");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!canEditSelected || !selected) return;
    setError(null);
    setMessage(null);
    try {
      await api(`/team/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: editDisplayName,
          colour: editColour,
          professionalTitle: editTitle || null,
          registrationBody: editBody || null,
          registrationNumber: editReg || null,
        }),
      });
      setMessage("Profile saved — registration appears on printed letters.");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save profile");
    }
  }

  async function saveHours() {
    if (!canEditSelected || !selected) return;
    setError(null);
    setMessage(null);
    const rules = DAYS.filter((d) => editDays[d.value]?.on).map((d) => ({
      dayOfWeek: d.value,
      startMinute: timeToMinutes(editDays[d.value].start),
      endMinute: timeToMinutes(editDays[d.value].end),
    }));
    try {
      await api(`/team/${selected.id}/availability`, {
        method: "PUT",
        body: JSON.stringify({ rules }),
      });
      setMessage("Availability saved — online booking will use these hours.");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save hours");
    }
  }

  async function toggleActive() {
    if (!isOwner || !selected) return;
    setError(null);
    try {
      await api(`/team/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !selected.active }),
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  async function addLeave() {
    if (!canEditSelected || !selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const days = eachDateInclusive(leaveFrom, leaveTo || leaveFrom);
    if (!days.length) {
      setError("Choose a valid leave date range");
      setBusy(false);
      return;
    }
    if (days.length > 31) {
      setError("Leave range is limited to 31 days at a time");
      setBusy(false);
      return;
    }
    try {
      let created = 0;
      for (const date of days) {
        await api("/blocks", {
          method: "POST",
          body: JSON.stringify({
            practitionerId: selected.id,
            date,
            reason: leaveReason || null,
            ...(leaveAllDay
              ? {}
              : {
                  startMinute: timeToMinutes(leaveStart),
                  endMinute: timeToMinutes(leaveEnd),
                }),
          }),
        });
        created += 1;
      }
      setMessage(
        `Blocked ${created} day${created === 1 ? "" : "s"} — diary and online booking will skip this time.`,
      );
      loadLeave(selected.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add leave");
    } finally {
      setBusy(false);
    }
  }

  async function removeLeave(id: string) {
    if (!canEditSelected) return;
    setError(null);
    try {
      await api(`/blocks/${id}`, { method: "DELETE" });
      setMessage("Leave block removed.");
      if (selected) loadLeave(selected.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove leave");
    }
  }

  return (
    <AppShell
      title="Team"
      subtitle="Practitioner profiles, weekly hours, registration, and leave."
    >
      {isOwner ? (
        <p className="alert-line">
          Staff rates and month pay summary:{" "}
          <Link href="/app/team/pay">Open staff pay →</Link>
        </p>
      ) : null}
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Practitioners</h2>
            <span className="count">{practitioners.length}</span>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <ul className="apt-list">
            {practitioners.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`apt-row team-row ${selectedId === p.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div
                    className="room-swatch"
                    style={{ background: p.colour }}
                    aria-hidden
                  />
                  <div className="apt-body">
                    <p className="apt-name">
                      {p.displayName}
                      {myProfileId === p.id ? " · you" : ""}
                    </p>
                    <p className="muted">
                      {[p.professionalTitle, p.membership.user.email]
                        .filter(Boolean)
                        .join(" · ")}
                      {!p.active ? " · inactive" : ""}
                    </p>
                    <p className="muted team-hours">
                      {formatRules(p.availability)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Profile & registration</h2>
          {selected ? (
            <>
              <p className="muted">
                Editing <strong>{selected.displayName}</strong>
                {!canEditSelected
                  ? " (view only — you can edit your own profile)"
                  : ""}
              </p>
              <label className="field">
                <span>Display name</span>
                <input
                  value={editDisplayName}
                  disabled={!canEditSelected}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Professional title</span>
                <input
                  value={editTitle}
                  disabled={!canEditSelected}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Chartered Physiotherapist"
                />
              </label>
              <div className="team-reg-row">
                <label className="field">
                  <span>Registration body</span>
                  <input
                    value={editBody}
                    disabled={!canEditSelected}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="HCPC"
                  />
                </label>
                <label className="field">
                  <span>Registration number</span>
                  <input
                    value={editReg}
                    disabled={!canEditSelected}
                    onChange={(e) => setEditReg(e.target.value)}
                    placeholder="PH12345"
                  />
                </label>
              </div>
              <fieldset className="field" disabled={!canEditSelected}>
                <legend className="muted">Diary colour</legend>
                <div className="colour-swatches">
                  {COLOURS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`colour-swatch ${editColour === c ? "selected" : ""}`}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => setEditColour(c)}
                    />
                  ))}
                  <input
                    type="color"
                    value={editColour}
                    onChange={(e) => setEditColour(e.target.value)}
                    aria-label="Custom colour"
                  />
                </div>
              </fieldset>
              {canEditSelected ? (
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void saveProfile()}
                  >
                    Save profile
                  </button>
                  {isOwner ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void toggleActive()}
                    >
                      {selected.active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">Select a practitioner.</p>
          )}
        </section>

        <section className="panel">
          <h2>Weekly hours</h2>
          {selected ? (
            <>
              <p className="muted">
                Used for online booking and staff slot suggestions.
              </p>
              <div className="hours-grid">
                {DAYS.map((d) => {
                  const row = editDays[d.value] ?? {
                    on: false,
                    start: "09:00",
                    end: "17:00",
                  };
                  return (
                    <div key={d.value} className="hours-row">
                      <label className="consent-label hours-day">
                        <input
                          type="checkbox"
                          checked={row.on}
                          disabled={!canEditSelected}
                          onChange={(e) =>
                            setEditDays((prev) => ({
                              ...prev,
                              [d.value]: { ...row, on: e.target.checked },
                            }))
                          }
                        />
                        <span>{d.label}</span>
                      </label>
                      <input
                        type="time"
                        value={row.start}
                        disabled={!canEditSelected || !row.on}
                        onChange={(e) =>
                          setEditDays((prev) => ({
                            ...prev,
                            [d.value]: { ...row, start: e.target.value },
                          }))
                        }
                      />
                      <span className="muted">to</span>
                      <input
                        type="time"
                        value={row.end}
                        disabled={!canEditSelected || !row.on}
                        onChange={(e) =>
                          setEditDays((prev) => ({
                            ...prev,
                            [d.value]: { ...row, end: e.target.value },
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {canEditSelected ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void saveHours()}
                >
                  Save hours
                </button>
              ) : (
                <p className="muted">Only owners or the practitioner can edit hours.</p>
              )}
            </>
          ) : (
            <p className="muted">Select a practitioner.</p>
          )}
        </section>

        <section className="panel">
          <h2>Leave & blocked time</h2>
          {selected ? (
            <>
              <p className="muted">
                Blocks the diary for leave, courses, or admin — same as Calendar
                “Block time”, with optional date ranges.
              </p>
              <div className="team-leave-form">
                <label className="field">
                  <span>From</span>
                  <input
                    type="date"
                    value={leaveFrom}
                    disabled={!canEditSelected}
                    onChange={(e) => setLeaveFrom(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="date"
                    value={leaveTo}
                    disabled={!canEditSelected}
                    onChange={(e) => setLeaveTo(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Reason</span>
                  <input
                    value={leaveReason}
                    disabled={!canEditSelected}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Annual leave"
                  />
                </label>
              </div>
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={leaveAllDay}
                  disabled={!canEditSelected}
                  onChange={(e) => setLeaveAllDay(e.target.checked)}
                />
                <span>All day</span>
              </label>
              {!leaveAllDay ? (
                <div className="team-leave-form">
                  <label className="field">
                    <span>Start</span>
                    <input
                      type="time"
                      value={leaveStart}
                      disabled={!canEditSelected}
                      onChange={(e) => setLeaveStart(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>End</span>
                    <input
                      type="time"
                      value={leaveEnd}
                      disabled={!canEditSelected}
                      onChange={(e) => setLeaveEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              {canEditSelected ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void addLeave()}
                >
                  {busy ? "Saving…" : "Add leave"}
                </button>
              ) : null}
              <ul className="apt-list team-leave-list">
                {leaveBlocks.length === 0 ? (
                  <li className="muted">No leave in the next 90 days.</li>
                ) : (
                  leaveBlocks.map((b) => (
                    <li key={b.id} className="team-leave-item">
                      <div>
                        <p className="apt-name">{dateKey(b.date)}</p>
                        <p className="muted">
                          {b.startMinute == null
                            ? "All day"
                            : `${minutesToTime(b.startMinute)}–${minutesToTime(b.endMinute ?? 0)}`}
                          {b.reason ? ` · ${b.reason}` : ""}
                        </p>
                      </div>
                      {canEditSelected ? (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => void removeLeave(b.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <p className="muted">Select a practitioner.</p>
          )}
        </section>

        {isOwner ? (
          <section className="panel">
            <h2>Add practitioner</h2>
            <p className="muted">
              Creates a login and diary profile. Default hours: Mon–Fri
              09:00–17:00 (edit after adding).
            </p>
            <label className="field">
              <span>Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>Display name on diary</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Same as full name if blank"
              />
            </label>
            <label className="field">
              <span>Professional title</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Osteopath"
              />
            </label>
            <div className="team-reg-row">
              <label className="field">
                <span>Registration body</span>
                <input
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="GOsC"
                />
              </label>
              <label className="field">
                <span>Registration number</span>
                <input
                  value={newReg}
                  onChange={(e) => setNewReg(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Email (login)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Temporary password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !email || !name || password.length < 8}
              onClick={() => void addPractitioner()}
            >
              {busy ? "Adding…" : "Add to team"}
            </button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
