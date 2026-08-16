"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Room = {
  id: string;
  name: string;
  colour: string;
  active: boolean;
  location: { id: string; name: string } | null;
};

export default function RoomsPage() {
  const { me } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canEdit = me?.role === "OWNER" || me?.role === "RECEPTION";

  const load = useCallback(() => {
    void api<{ rooms: Room[] }>("/rooms")
      .then((d) => setRooms(d.rooms))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addRoom() {
    if (!name.trim()) return;
    setError(null);
    try {
      await api("/rooms", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("");
      setMessage("Room added.");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add room");
    }
  }

  async function toggleActive(room: Room) {
    setError(null);
    try {
      await api(`/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !room.active }),
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <AppShell
      title="Rooms"
      subtitle="Treatment rooms and couches — booked like practitioners, without fake diary users."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Resources</h2>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <ul className="apt-list">
            {rooms.map((r) => (
              <li key={r.id} className="apt-row">
                <div
                  className="room-swatch"
                  style={{ background: r.colour }}
                  aria-hidden
                />
                <div className="apt-body">
                  <p className="apt-name">{r.name}</p>
                  <p className="muted">
                    {r.location?.name ?? "Clinic"} ·{" "}
                    {r.active ? "active" : "inactive"}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => void toggleActive(r)}
                  >
                    {r.active ? "Deactivate" : "Activate"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {rooms.length === 0 ? (
            <p className="muted">No rooms yet — add Couch 1 / Couch 2.</p>
          ) : null}
        </section>

        {canEdit ? (
          <section className="panel">
            <h2>Add room</h2>
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Couch 3"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void addRoom()}
            >
              Add room
            </button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
