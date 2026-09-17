"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  defaultPriceCents: number;
  depositCents: number | null;
  colour: string;
  onlineBookable: boolean;
  active: boolean;
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function poundsToCents(raw: string): number {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

const emptyForm = {
  name: "",
  durationMinutes: "30",
  pricePounds: "55.00",
  onlineBookable: true,
};

export default function ServicesPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = me?.role === "OWNER" || me?.role === "RECEPTION";

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role === "PRACTITIONER") {
      router.replace("/app");
    }
  }, [authLoading, me, router]);

  const load = useCallback(() => {
    void api<{ appointmentTypes: Service[] }>("/clinic/appointment-types")
      .then((d) => setServices(d.appointmentTypes))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      durationMinutes: String(s.durationMinutes),
      pricePounds: (s.defaultPriceCents / 100).toFixed(2),
      onlineBookable: s.onlineBookable,
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const durationMinutes = Number.parseInt(form.durationMinutes, 10);
    const defaultPriceCents = poundsToCents(form.pricePounds);
    if (!form.name.trim()) {
      setError("Name is required");
      setBusy(false);
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
      setError("Length must be at least 5 minutes");
      setBusy(false);
      return;
    }
    try {
      const body = {
        name: form.name.trim(),
        durationMinutes,
        defaultPriceCents,
        onlineBookable: form.onlineBookable,
      };
      if (editingId) {
        await api(`/clinic/appointment-types/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage("Service updated.");
      } else {
        await api("/clinic/appointment-types", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Service added.");
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save service");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Service) {
    setError(null);
    try {
      await api(`/clinic/appointment-types/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !s.active }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function toggleOnline(s: Service) {
    setError(null);
    try {
      await api(`/clinic/appointment-types/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ onlineBookable: !s.onlineBookable }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  return (
    <AppShell
      title="Services"
      subtitle="Your clinic’s appointment types — length and price drive diary slots, online booking, and invoices."
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>Catalogue</h2>
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="alert-line">{message}</p> : null}
          <ul className="apt-list">
            {services.map((s) => (
              <li key={s.id} className="apt-row">
                <div
                  className="room-swatch"
                  style={{ background: s.colour }}
                  aria-hidden
                />
                <div className="apt-body">
                  <p className="apt-name">{s.name}</p>
                  <p className="muted">
                    {s.durationMinutes} min · {formatGbp(s.defaultPriceCents)}
                    {s.onlineBookable ? " · online" : " · staff only"}
                    {!s.active ? " · inactive" : ""}
                  </p>
                </div>
                {canEdit ? (
                  <div className="apt-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => startEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => void toggleOnline(s)}
                      disabled={!s.active}
                    >
                      {s.onlineBookable ? "Hide online" : "Show online"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => void toggleActive(s)}
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {services.length === 0 ? (
            <p className="muted">
              No services yet — add an initial assessment or follow-up.
            </p>
          ) : null}
        </section>

        {canEdit ? (
          <section className="panel">
            <h2>{editingId ? "Edit service" : "Add service"}</h2>
            <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
              <label className="field">
                <span>Name</span>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Physio · Follow-up"
                  required
                />
              </label>
              <label className="field">
                <span>Length (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationMinutes: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Price (£)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.pricePounds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pricePounds: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field field-check">
                <input
                  type="checkbox"
                  checked={form.onlineBookable}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      onlineBookable: e.target.checked,
                    }))
                  }
                />
                <span>Available for online booking</span>
              </label>
              <div className="landing-cta">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy}
                >
                  {editingId ? "Save changes" : "Add service"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        ) : (
          <section className="panel">
            <h2>Services</h2>
            <p className="muted">
              Only owners and reception can add or edit services.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
