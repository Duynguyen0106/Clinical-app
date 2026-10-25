"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  BODY_MAP_CONTENT_KEY,
  emptyBodyMap,
  isBodyMapContent,
  parseBodyMap,
  withBodyMap,
  type BodyMapContent,
} from "@/modules/notes/body-map";
import { parseTemplateSections } from "@/modules/notes/templates";
import { BodyMapEditor } from "@/components/body-map/BodyMapEditor";
import { NotePrintActions } from "@/components/NotePrintActions";

type NotePayload = {
  note: {
    id: string;
    status: string;
    content: Record<string, unknown>;
    signedAt: string | null;
    visitId: string | null;
    patient: { id: string; firstName: string; lastName: string };
    template: { id: string; name: string; schema: unknown } | null;
  };
};

type Props = {
  noteId: string;
};

export function ClinicalChartWorkspace({ noteId }: Props) {
  const [note, setNote] = useState<NotePayload["note"] | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const sections = useMemo(
    () => parseTemplateSections(note?.template?.schema),
    [note?.template?.schema],
  );
  const markdownSections = sections.filter((s) => s.type === "markdown");
  // Always show chart (align with VisitRecorder) — even if older templates omit it
  const readOnly = note?.status === "SIGNED" || note?.status === "VOIDED";

  const bodyMap = useMemo(() => parseBodyMap(content), [content]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<NotePayload>(`/notes/${noteId}`);
      const raw =
        data.note.content && typeof data.note.content === "object"
          ? (data.note.content as Record<string, unknown>)
          : {};
      const next = isBodyMapContent(raw[BODY_MAP_CONTENT_KEY])
        ? raw
        : withBodyMap(raw, emptyBodyMap());
      setNote(data.note);
      setContent(next);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load note");
    }
  }, [noteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (nextContent: Record<string, unknown>) => {
      if (readOnly) return;
      setSaving(true);
      setError(null);
      try {
        await api(`/notes/${noteId}`, {
          method: "PATCH",
          body: JSON.stringify({ content: nextContent }),
        });
        setContent(nextContent);
        setSavedAt(new Date().toISOString());
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [noteId, readOnly],
  );

  function scheduleAutosave(next: Record<string, unknown>) {
    setContent(next);
    setDirty(true);
    if (readOnly) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void save(next);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  function updateMarkdown(id: string, value: string) {
    scheduleAutosave({ ...content, [id]: value });
  }

  function updateBodyMap(map: BodyMapContent) {
    scheduleAutosave(withBodyMap(content, map));
  }

  async function sign() {
    if (readOnly) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    setError(null);
    try {
      await api(`/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: contentRef.current }),
      });
      await api(`/notes/${noteId}/sign`, { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    } finally {
      setSaving(false);
    }
  }

  if (!note && !error) {
    return <p className="muted">Loading chart…</p>;
  }

  if (!note) {
    return <p className="form-error">{error}</p>;
  }

  const name = `${note.patient.firstName} ${note.patient.lastName}`;

  return (
    <div className="chart-workspace">
      <header className="chart-workspace-head">
        <div>
          <p className="eyebrow">Clinical chart</p>
          <h2>
            {name}
            {note.template?.name ? (
              <span className="muted"> · {note.template.name}</span>
            ) : null}
          </h2>
          <p className="muted">
            {note.status === "DRAFT"
              ? "Draft — edits autosave; review body chart, then sign."
              : note.status === "SIGNED"
                ? "Signed record — read only."
                : "Voided record — read only."}
            {saving
              ? " · Saving…"
              : dirty
                ? " · Unsaved changes"
                : savedAt
                  ? ` · Saved ${new Date(savedAt).toLocaleTimeString()}`
                  : ""}
          </p>
        </div>
        <div className="chart-workspace-actions">
          {note.visitId ? (
            <Link href={`/app/visits/${note.visitId}`} className="btn-ghost btn-sm">
              Open visit
            </Link>
          ) : null}
          <Link href="/app/notes" className="btn-ghost btn-sm">
            All notes
          </Link>
          {!readOnly ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={saving}
                onClick={() => void save(content)}
              >
                {saving ? "Saving…" : "Save now"}
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={saving}
                onClick={() => void sign()}
              >
                Sign note
              </button>
            </>
          ) : note.status === "SIGNED" ? (
            <NotePrintActions noteId={note.id} />
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="chart-workspace-grid">
        <section className="chart-sections note-panel">
          <div className="note-panel-head">
            <h3>Structured note</h3>
          </div>
          <div className="note-editor">
            {(markdownSections.length > 0
              ? markdownSections
              : fallbackMarkdownKeys(content)
            ).map((section) => {
              const key = typeof section === "string" ? section : section.id;
              const title =
                typeof section === "string"
                  ? titleCase(section)
                  : section.title;
              const hint =
                typeof section === "string" ? undefined : section.hint;
              const val = content[key];
              const text = typeof val === "string" ? val : "";
              return (
                <label key={key} className="note-field">
                  <span>{title}</span>
                  {hint ? <span className="muted note-hint">{hint}</span> : null}
                  <textarea
                    value={text}
                    onChange={(e) => updateMarkdown(key, e.target.value)}
                    readOnly={readOnly}
                    rows={5}
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className="chart-body-map note-panel">
          <div className="note-panel-head">
            <h3>Body chart</h3>
            <span className="muted">
              Pain · lesion · somatic dysfunction · all views
            </span>
          </div>
          <BodyMapEditor
            value={bodyMap}
            onChange={updateBodyMap}
            readOnly={readOnly}
          />
        </section>
      </div>
    </div>
  );
}

function fallbackMarkdownKeys(content: Record<string, unknown>): string[] {
  return Object.keys(content).filter(
    (k) =>
      k !== BODY_MAP_CONTENT_KEY &&
      k !== "clinician_review_flags" &&
      typeof content[k] === "string",
  );
}

function titleCase(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
