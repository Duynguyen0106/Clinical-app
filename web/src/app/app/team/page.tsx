"use client";

import { useCallback, useEffect, useState } from "react";
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
  availability: Rule[];
  membership: {
    user: { email: string; name: string };
  };
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

export default function TeamPage() {
  const { me } = useAuth();
  const isOwner = me?.role === "OWNER";
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [editDays, setEditDays] = useState<
    Record<number, { on: boolean; start: string; end: string }>
  >({});

  const load = useCallback(() => {
    void api<{ practitioners: Practitioner[] }>("/team")
      .then((d) => {
        setPractitioners(d.practitioners);
        if (!selectedId && d.practitioners[0]) {
          setSelectedId(d.practitioners[0].id);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [selectedId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, []);

  const selected = practitioners.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
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
  }, [selected]);

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
        }),
      });
      setMessage(`Added ${d.practitioner.displayName}.`);
      setEmail("");
      setName("");
      setDisplayName("");
      setPassword("");
      setSelectedId(d.practitioner.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add practitioner");
    } finally {
      setBusy(false);
    }
  }

  async function saveHours() {
    if (!isOwner || !selected) return;
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

  return (
    <AppShell
      title="Team"
      subtitle="Add practitioners and set weekly hours for online booking."
    >
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
                    <p className="apt-name">{p.displayName}</p>
                    <p className="muted">
                      {p.membership.user.email}
                      {!p.active ? " · inactive" : ""}
                    </p>
                    <p className="muted team-hours">{formatRules(p.availability)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Weekly hours</h2>
          {selected ? (
            <>
              <p className="muted">
                Editing <strong>{selected.displayName}</strong>
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
                          disabled={!isOwner}
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
                        disabled={!isOwner || !row.on}
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
                        disabled={!isOwner || !row.on}
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
              {isOwner ? (
                <div className="home-cta">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void saveHours()}
                  >
                    Save hours
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void toggleActive()}
                  >
                    {selected.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ) : (
                <p className="muted">Only owners can edit team hours.</p>
              )}
            </>
          ) : (
            <p className="muted">Select a practitioner.</p>
          )}
        </section>

        {isOwner ? (
          <section className="panel">
            <h2>Add practitioner</h2>
            <p className="muted">
              Creates a login and diary profile. Default hours: Mon–Fri 09:00–17:00
              (edit after adding).
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
