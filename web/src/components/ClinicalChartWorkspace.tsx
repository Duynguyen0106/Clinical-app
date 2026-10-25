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
  type BodyChartCustomView,
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
    updatedAt?: string;
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
  const [signing, setSigning] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [customViews, setCustomViews] = useState<BodyChartCustomView[]>([]);
  const [archivedViews, setArchivedViews] = useState<BodyChartCustomView[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  /** Monotonic save generation — stale in-flight PATCHes must not clobber UI. */
  const saveSeq = useRef(0);
  const saveAbort = useRef<AbortController | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const signingRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);

  const sections = useMemo(
    () => parseTemplateSections(note?.template?.schema),
    [note?.template?.schema],
  );
  const markdownSections = sections.filter((s) => s.type === "markdown");
  // Always show chart (align with VisitRecorder) — even if older templates omit it
  const statusLocked =
    note?.status === "SIGNED" || note?.status === "VOIDED";
  const readOnly = statusLocked || signing;

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
      baseUpdatedAtRef.current =
        typeof data.note.updatedAt === "string"
          ? data.note.updatedAt
          : data.note.updatedAt
            ? new Date(data.note.updatedAt as string).toISOString()
            : null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load note");
    }
  }, [noteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api<{
      config: {
        customViews: BodyChartCustomView[];
        archivedViews?: BodyChartCustomView[];
      };
    }>("/clinic/body-chart")
      .then((d) => {
        setCustomViews(d.config.customViews ?? []);
        setArchivedViews(d.config.archivedViews ?? []);
      })
      .catch(() => {
        setCustomViews([]);
        setArchivedViews([]);
      });
  }, []);

  const mergeServerSnapshots = useCallback((serverContent: unknown) => {
    const serverMap = parseBodyMap(serverContent);
    if (!serverMap.viewSnapshots?.length) return;
    const local = parseBodyMap(contentRef.current);
    const merged = withBodyMap(contentRef.current, {
      ...local,
      viewSnapshots: serverMap.viewSnapshots,
    });
    contentRef.current = merged;
    setContent(merged);
  }, []);

  const save = useCallback(
    async (nextContent: Record<string, unknown>) => {
      if (statusLocked || signingRef.current) return;
      const seq = ++saveSeq.current;
      saveAbort.current?.abort();
      const ac = new AbortController();
      saveAbort.current = ac;
      setSaving(true);
      setError(null);
      const run = (async () => {
        try {
          const data = await api<{
            note: { updatedAt?: string; content?: unknown };
          }>(`/notes/${noteId}`, {
            method: "PATCH",
            body: JSON.stringify({
              content: nextContent,
              ...(baseUpdatedAtRef.current
                ? { baseUpdatedAt: baseUpdatedAtRef.current }
                : {}),
            }),
            signal: ac.signal,
          });
          if (seq !== saveSeq.current) return;
          if (typeof data.note.updatedAt === "string") {
            baseUpdatedAtRef.current = data.note.updatedAt;
          }
          if (data.note.content && typeof data.note.content === "object") {
            mergeServerSnapshots(data.note.content);
          }
          if (contentRef.current === nextContent || !signingRef.current) {
            // Clear dirty when we saved the latest local payload
            if (
              JSON.stringify(parseBodyMap(contentRef.current).marks) ===
              JSON.stringify(parseBodyMap(nextContent).marks)
            ) {
              setDirty(false);
            }
          }
          setSavedAt(new Date().toISOString());
        } catch (e) {
          if (ac.signal.aborted || seq !== saveSeq.current) return;
          setError(e instanceof Error ? e.message : "Save failed");
        } finally {
          if (seq === saveSeq.current) setSaving(false);
        }
      })();
      savePromiseRef.current = run;
      await run;
    },
    [noteId, statusLocked, mergeServerSnapshots],
  );

  function scheduleAutosave(next: Record<string, unknown>) {
    contentRef.current = next;
    setContent(next);
    setDirty(true);
    if (statusLocked || signingRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (signingRef.current) return;
      void save(contentRef.current);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      saveAbort.current?.abort();
    };
  }, []);

  function updateMarkdown(id: string, value: string) {
    // Always apply locally so marksRef / text stay consistent; skip autosave while signing
    const next = { ...contentRef.current, [id]: value };
    if (signingRef.current) {
      contentRef.current = next;
      setContent(next);
      return;
    }
    scheduleAutosave(next);
  }

  function updateBodyMap(map: BodyMapContent) {
    const next = withBodyMap(contentRef.current, map);
    if (signingRef.current) {
      contentRef.current = next;
      setContent(next);
      return;
    }
    scheduleAutosave(next);
  }

  async function sign() {
    if (statusLocked || signingRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    // Wait for in-flight autosave to finish (don't abort — server may still commit)
    if (savePromiseRef.current) {
      await savePromiseRef.current.catch(() => {});
    }
    signingRef.current = true;
    setSigning(true);
    setSaving(true);
    setError(null);
    try {
      const patchOnce = () =>
        api<{ note: { updatedAt?: string; content?: unknown } }>(
          `/notes/${noteId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              content: contentRef.current,
              ...(baseUpdatedAtRef.current
                ? { baseUpdatedAt: baseUpdatedAtRef.current }
                : {}),
            }),
          },
        );
      let patched;
      try {
        patched = await patchOnce();
      } catch (e) {
        // OCC conflict after a late autosave — refresh token and retry once
        const msg = e instanceof Error ? e.message : "";
        if (!/modified elsewhere/i.test(msg)) throw e;
        const fresh = await api<NotePayload>(`/notes/${noteId}`);
        baseUpdatedAtRef.current =
          typeof fresh.note.updatedAt === "string"
            ? fresh.note.updatedAt
            : null;
        patched = await patchOnce();
      }
      if (typeof patched.note.updatedAt === "string") {
        baseUpdatedAtRef.current = patched.note.updatedAt;
      }
      if (patched.note.content) mergeServerSnapshots(patched.note.content);
      await api(`/notes/${noteId}/sign`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    } finally {
      signingRef.current = false;
      setSigning(false);
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
            {signing
              ? " · Signing…"
              : saving
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
          {!statusLocked ? (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={saving || signing}
                onClick={() => void save(contentRef.current)}
              >
                {saving && !signing ? "Saving…" : "Save now"}
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={saving || signing}
                onClick={() => void sign()}
              >
                {signing ? "Signing…" : "Sign note"}
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
            customViews={customViews}
            archivedViews={archivedViews}
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
