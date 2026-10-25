"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  parseTemplateSections,
  type NoteSection,
  type NoteSectionType,
} from "@/modules/notes/templates";
import type { BodyChartCustomView } from "@/modules/notes/body-map";

type TemplateRow = {
  id: string;
  name: string;
  isDefault: boolean;
  schema: unknown;
};

const EMPTY_SECTION: NoteSection = {
  id: "subjective",
  title: "Subjective",
  type: "markdown",
};

export default function NoteTemplatesSettingsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [sections, setSections] = useState<NoteSection[]>([EMPTY_SECTION]);
  const [saving, setSaving] = useState(false);
  const [customViews, setCustomViews] = useState<BodyChartCustomView[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [customSvg, setCustomSvg] = useState("");
  const [customBusy, setCustomBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !me) return;
    if (me.role !== "OWNER") {
      router.replace("/app/settings");
    }
  }, [authLoading, me, router]);

  async function load() {
    setError(null);
    try {
      const data = await api<{ templates: TemplateRow[] }>("/note-templates");
      setTemplates(data.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    }
  }

  async function loadCustomViews() {
    try {
      const data = await api<{ config: { customViews: BodyChartCustomView[] } }>(
        "/clinic/body-chart",
      );
      setCustomViews(data.config.customViews ?? []);
    } catch {
      setCustomViews([]);
    }
  }

  useEffect(() => {
    if (me?.role === "OWNER") {
      void load();
      void loadCustomViews();
    }
  }, [me?.role]);

  function startNew() {
    setEditingId("new");
    setName("");
    setIsDefault(false);
    setSections([
      { id: "subjective", title: "Subjective", type: "markdown" },
      { id: "objective", title: "Objective", type: "markdown" },
      {
        id: "body_map",
        title: "Body chart",
        type: "body_map",
        hint: "Pain, lesion, somatic dysfunction",
      },
      { id: "assessment", title: "Assessment", type: "markdown" },
      { id: "plan", title: "Plan", type: "markdown" },
    ]);
    setMessage(null);
  }

  function startEdit(t: TemplateRow) {
    setEditingId(t.id);
    setName(t.name);
    setIsDefault(t.isDefault);
    setSections(parseTemplateSections(t.schema));
    setMessage(null);
  }

  function updateSection(i: number, patch: Partial<NoteSection>) {
    setSections((rows) =>
      rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );
  }

  function addSection(type: NoteSectionType) {
    const id =
      type === "body_map"
        ? "body_map"
        : `section_${sections.length + 1}`;
    setSections((rows) => [
      ...rows,
      {
        id,
        title: type === "body_map" ? "Body chart" : "New section",
        type,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = { name, isDefault, sections };
    try {
      if (editingId === "new") {
        await api("/note-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Template created.");
      } else if (editingId) {
        await api(`/note-templates/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Template saved.");
      }
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this unused template?")) return;
    setError(null);
    try {
      await api(`/note-templates/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!authLoading && me && me.role !== "OWNER") {
    return (
      <AppShell title="Note templates" subtitle="Owner only.">
        <p className="muted">Redirecting…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Note templates"
      subtitle="Customise SOAP sections and body charts for your clinic."
    >
      <p className="muted">
        <Link href="/app/settings">← Settings</Link>
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Templates</h2>
          <button type="button" className="btn-primary btn-sm" onClick={startNew}>
            New template
          </button>
        </div>
        <ul className="apt-list">
          {templates.map((t) => (
            <li key={t.id} className="patient-row">
              <div>
                <p className="apt-name">
                  {t.name}
                  {t.isDefault ? " · default" : ""}
                </p>
                <p className="muted">
                  {parseTemplateSections(t.schema)
                    .map((s) => s.title)
                    .join(" · ")}
                </p>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => startEdit(t)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void remove(t.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {editingId ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{editingId === "new" ? "New template" : "Edit template"}</h2>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Osteopathy session"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Default for new visits
            </label>
          </div>

          <h3 className="mt-4">Sections</h3>
          <ul className="template-section-list">
            {sections.map((s, i) => (
              <li key={`${s.id}-${i}`} className="template-section-row">
                <label>
                  Id
                  <input
                    value={s.type === "body_map" ? "body_map" : s.id}
                    disabled={s.type === "body_map"}
                    onChange={(e) =>
                      updateSection(i, {
                        id: e.target.value.replace(/\s+/g, "_"),
                      })
                    }
                  />
                </label>
                <label>
                  Title
                  <input
                    value={s.title}
                    onChange={(e) => updateSection(i, { title: e.target.value })}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={s.type}
                    onChange={(e) => {
                      const type = e.target.value as NoteSectionType;
                      updateSection(i, {
                        type,
                        id: type === "body_map" ? "body_map" : s.id === "body_map" ? `section_${i + 1}` : s.id,
                        title:
                          type === "body_map" && !s.title
                            ? "Body chart"
                            : s.title,
                      });
                    }}
                  >
                    <option value="markdown">Text (markdown)</option>
                    <option value="body_map">Body chart</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    setSections((rows) => rows.filter((_, idx) => idx !== i))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => addSection("markdown")}
            >
              Add text section
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => addSection("body_map")}
            >
              Add body chart
            </button>
          </div>

          <div className="row-actions mt-4">
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !name.trim() || sections.length === 0}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save template"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Custom anatomy views</h2>
        </div>
        <p className="muted">
          Upload plain SVG overlays (viewBox 0 0 200 360 works best). Scripts and
          images are rejected. These appear as extra tabs on the body chart.
        </p>
        <ul className="apt-list">
          {customViews.map((v) => (
            <li key={v.id} className="patient-row">
              <div>
                <p className="apt-name">{v.label}</p>
                <p className="muted">{v.id}</p>
              </div>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  void api(`/clinic/body-chart?id=${encodeURIComponent(v.id)}`, {
                    method: "DELETE",
                  })
                    .then(() => loadCustomViews())
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="form-grid">
          <label>
            Label
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. TMJ close-up"
            />
          </label>
          <label className="body-map-attr-grow">
            SVG markup
            <textarea
              rows={5}
              value={customSvg}
              onChange={(e) => setCustomSvg(e.target.value)}
              placeholder='<svg viewBox="0 0 200 360" xmlns="http://www.w3.org/2000/svg">…</svg>'
            />
          </label>
        </div>
        <div className="row-actions mt-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={
              customBusy || !customLabel.trim() || customSvg.trim().length < 20
            }
            onClick={() => {
              setCustomBusy(true);
              setError(null);
              void api("/clinic/body-chart", {
                method: "POST",
                body: JSON.stringify({
                  label: customLabel.trim(),
                  svg: customSvg.trim(),
                }),
              })
                .then(() => {
                  setCustomLabel("");
                  setCustomSvg("");
                  setMessage("Custom anatomy view saved.");
                  return loadCustomViews();
                })
                .catch((e: Error) => setError(e.message))
                .finally(() => setCustomBusy(false));
            }}
          >
            {customBusy ? "Saving…" : "Add custom view"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
