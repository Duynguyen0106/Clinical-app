"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";
import { NotePrintActions } from "@/components/NotePrintActions";
import { VisitInvoiceActions } from "@/components/VisitInvoiceActions";
import {
  clearVisitAudioBuffer,
  loadVisitAudioBuffer,
  pickRecordingMimeType,
  saveVisitAudioBuffer,
  withRetry,
} from "@/lib/visit-audio-buffer";

type Phase =
  | "loading"
  | "consent"
  | "ready"
  | "recording"
  | "processing"
  | "review"
  | "signed"
  | "recover"
  | "error";

type VisitPayload = {
  id: string;
  recordingConsentAt: string | null;
  appointment: {
    id: string;
    patient: { id: string; firstName: string; lastName: string };
    appointmentType: { name: string };
  };
  recording: {
    id: string;
    status: string;
    storageKey: string | null;
    error: string | null;
    durationSec: number | null;
  } | null;
  notes: Array<{
    id: string;
    status: string;
    content: Record<string, unknown>;
    parentNoteId?: string | null;
    voidReason?: string | null;
  }>;
};

type Props = { visitId: string };

export function VisitRecorder({ visitId }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [consentChecked, setConsentChecked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [visit, setVisit] = useState<VisitPayload | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [recoverHint, setRecoverHint] = useState<string | null>(null);
  const [rebook, setRebook] = useState<{
    suggestedWeeks: number;
    appointmentTypeName: string;
    planExcerpt: string;
    slots: string[];
  } | null>(null);
  const [rebookBusy, setRebookBusy] = useState(false);
  const [rebookDone, setRebookDone] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [addendumText, setAddendumText] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState<
    null | "void" | "addendum"
  >(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef({ mimeType: "audio/webm", extension: "webm" });
  const elapsedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { visit: v } = await api<{ visit: VisitPayload }>(
          `/visits/${visitId}`,
        );
        if (cancelled) return;
        setVisit(v);
        const draft = v.notes.find((n) => n.status === "DRAFT");
        const signed = v.notes.find((n) => n.status === "SIGNED");
        if (signed) {
          setNoteId(signed.id);
          setContent(stringifyContent(signed.content));
          setPhase("signed");
          return;
        }
        if (draft) {
          setNoteId(draft.id);
          setContent(stringifyContent(draft.content));
          setFlags(asFlags(draft.content));
          setPhase("review");
          return;
        }

        const local = await loadVisitAudioBuffer(visitId);
        if (cancelled) return;
        const rec = v.recording;
        const failed =
          rec &&
          (rec.status === "FAILED" ||
            rec.status === "UPLOADING" ||
            rec.status === "TRANSCRIBING" ||
            rec.status === "ORGANISING");

        if (failed || local) {
          setRecoverHint(
            rec?.error
              ? rec.error
              : local
                ? "Audio is saved on this device — you can upload and organise without recording again."
                : "Recording is incomplete. Retry organise if audio reached the server, or record again.",
          );
          if (local) setElapsed(local.durationSec || 0);
          setPhase("recover");
          return;
        }

        if (v.recordingConsentAt) {
          setPhase("ready");
        } else {
          setPhase("consent");
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load visit");
        setPhase("error");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [visitId]);

  async function continueAfterConsent() {
    await api(`/visits/${visitId}/consent`, {
      method: "POST",
      body: JSON.stringify({ granted: true, method: "in_person" }),
    });
    setPhase("ready");
  }

  async function startRecording() {
    setError(null);
    setMicHint(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const picked = pickRecordingMimeType();
      mimeRef.current = picked;
      const recorder = picked.mimeType
        ? new MediaRecorder(stream, { mimeType: picked.mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || picked.mimeType || "audio/webm",
          });
          void saveVisitAudioBuffer({
            visitId,
            blob,
            mimeType: blob.type || picked.mimeType || "audio/webm",
            filename: `visit.${picked.extension}`,
            durationSec: elapsedRef.current || 1,
          });
        }
      };

      await api(`/visits/${visitId}/recording`, { method: "POST" });
      recorder.start(1000);
      setPhase("recording");
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          const next = s + 1;
          elapsedRef.current = next;
          return next;
        });
      }, 1000);
    } catch {
      setMicHint(
        "Microphone permission is required. Allow mic access and try again — Treow works as a PWA on your phone too.",
      );
    }
  }

  async function finaliseBlobFromRecorder(): Promise<Blob> {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      const local = await loadVisitAudioBuffer(visitId);
      if (local) return local.blob;
      throw new Error("No recorder");
    }

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || mimeRef.current.mimeType || "audio/webm",
          }),
        );
      };
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await saveVisitAudioBuffer({
      visitId,
      blob,
      mimeType: blob.type || mimeRef.current.mimeType || "audio/webm",
      filename: `visit.${mimeRef.current.extension}`,
      durationSec: elapsedRef.current || elapsed || 1,
    });

    return blob;
  }

  async function waitForOrganisedNote() {
    setStatusLine("Organising in the background…");
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const { visit: v } = await api<{ visit: VisitPayload }>(
        `/visits/${visitId}`,
      );
      const draft = v.notes.find((n) => n.status === "DRAFT");
      if (draft) {
        await clearVisitAudioBuffer(visitId);
        setVisit(v);
        setNoteId(draft.id);
        setContent(stringifyContent(draft.content));
        setFlags(asFlags(draft.content));
        setPhase("review");
        return;
      }
      if (v.recording?.status === "FAILED") {
        throw new Error(
          v.recording.error ||
            "Organise failed — you can retry from this device",
        );
      }
      setStatusLine(
        v.recording?.status === "ORGANISING"
          ? "Drafting clinical note…"
          : "Transcribing & organising note…",
      );
    }
    throw new Error(
      "Organise is taking longer than expected — open this visit again shortly, or retry.",
    );
  }

  async function uploadAndOrganise(blob: Blob, durationSec: number) {
    setPhase("processing");
    setError(null);
    setStatusLine("Uploading recording…");

    const ext =
      mimeRef.current.extension ||
      (blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("aac")
          ? "aac"
          : "webm");
    const form = new FormData();
    form.append("audio", blob, `visit.${ext}`);

    await withRetry(
      () =>
        api(`/visits/${visitId}/recording/upload`, {
          method: "POST",
          body: form,
        }),
      { attempts: 3, delayMs: 800 },
    );

    setStatusLine("Transcribing & organising note…");
    const result = await withRetry(
      () =>
        api<{
          async?: boolean;
          job?: { id: string };
          note?: { id: string; content: Record<string, unknown> };
        }>(`/visits/${visitId}/recording`, {
          method: "PATCH",
          body: JSON.stringify({ durationSec: durationSec || 1 }),
        }),
      { attempts: 2, delayMs: 1200 },
    );

    if (result.note) {
      await clearVisitAudioBuffer(visitId);
      setNoteId(result.note.id);
      setContent(stringifyContent(result.note.content));
      setFlags(asFlags(result.note.content));
      setPhase("review");
      return;
    }

    await waitForOrganisedNote();
  }

  async function stopAndOrganise() {
    try {
      setPhase("processing");
      setStatusLine("Finalising audio…");
      const blob = await finaliseBlobFromRecorder();
      await uploadAndOrganise(blob, elapsedRef.current || elapsed || 1);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not organise note";
      setError(msg);
      setRecoverHint(
        "Your audio is kept on this device. Retry upload & organise, or record again if needed.",
      );
      setPhase("recover");
    }
  }

  async function retryFromBuffer() {
    setError(null);
    try {
      const local = await loadVisitAudioBuffer(visitId);
      if (local) {
        mimeRef.current = {
          mimeType: local.mimeType,
          extension: local.filename.split(".").pop() || "webm",
        };
        await uploadAndOrganise(local.blob, local.durationSec || elapsed || 1);
        return;
      }

      // Server may already have audio from a prior upload
      setPhase("processing");
      setStatusLine("Re-organising from saved recording…");
      const result = await withRetry(
        () =>
          api<{
            async?: boolean;
            note?: { id: string; content: Record<string, unknown> };
          }>(`/visits/${visitId}/recording`, {
            method: "PATCH",
            body: JSON.stringify({ durationSec: elapsed || 1 }),
          }),
        { attempts: 2, delayMs: 1200 },
      );
      if (result.note) {
        setNoteId(result.note.id);
        setContent(stringifyContent(result.note.content));
        setFlags(asFlags(result.note.content));
        setPhase("review");
        return;
      }
      await waitForOrganisedNote();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Retry failed";
      setError(msg);
      setPhase("recover");
    }
  }

  async function discardLocalAndRecordAgain() {
    await clearVisitAudioBuffer(visitId);
    setError(null);
    setRecoverHint(null);
    setPhase("ready");
  }

  async function signNote() {
    if (!noteId) return;
    await api(`/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
    await api(`/notes/${noteId}/sign`, { method: "POST" });
    setPhase("signed");
    try {
      const { suggestion } = await api<{
        suggestion: {
          suggestedWeeks: number;
          appointmentTypeName: string;
          planExcerpt: string;
          slots: string[];
        };
      }>(`/visits/${visitId}/rebook`);
      setRebook(suggestion);
    } catch {
      setRebook(null);
    }
  }

  async function voidNote() {
    if (!noteId || voidReason.trim().length < 3) return;
    setCorrectionBusy(true);
    setError(null);
    try {
      await api(`/notes/${noteId}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setCorrectionOpen(null);
      setVoidReason("");
      setNoteId(null);
      setContent({});
      setFlags([]);
      setPhase("ready");
      setRebook(null);
      setRebookDone(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void note");
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function createAddendum() {
    if (!noteId || !addendumText.trim()) return;
    setCorrectionBusy(true);
    setError(null);
    try {
      const { note } = await api<{
        note: { id: string; content: Record<string, unknown> };
      }>(`/notes/${noteId}/addendum`, {
        method: "POST",
        body: JSON.stringify({ text: addendumText.trim() }),
      });
      setNoteId(note.id);
      setContent(stringifyContent(note.content));
      setFlags(asFlags(note.content));
      setCorrectionOpen(null);
      setAddendumText("");
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create addendum");
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function bookFollowUp(startsAt: string) {
    setRebookBusy(true);
    try {
      const { appointment } = await api<{
        appointment: { startsAt: string };
      }>(`/visits/${visitId}/rebook`, {
        method: "POST",
        body: JSON.stringify({ startsAt }),
      });
      setRebookDone(appointment.startsAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not book follow-up");
    } finally {
      setRebookBusy(false);
    }
  }

  const patientName = visit
    ? `${visit.appointment.patient.firstName} ${visit.appointment.patient.lastName}`
    : "…";
  const appointmentType = visit?.appointment.appointmentType.name ?? "";

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const fields = Object.keys(content).filter((k) => k !== "clinician_review_flags");

  return (
    <div className="visit-stack">
      {visit?.appointment.patient.id ? (
        <PatientPrepPanel
          patientId={visit.appointment.patient.id}
          compact
          className="visit-prep"
          source="visit"
        />
      ) : null}
      <div className="visit-layout">
        <section className="visit-panel">
          <p className="eyebrow">Visit mode</p>
          <h2>{patientName}</h2>
          <p className="muted">{appointmentType}</p>

          {phase === "loading" ? <p className="muted">Loading visit…</p> : null}
          {phase === "error" ? <p className="form-error">{error}</p> : null}

          {phase === "consent" && (
            <div className="consent-box">
              <label className="consent-label">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span>
                  Patient has consented to audio recording for clinical
                  documentation. Consent is stored on the visit record (UK GDPR).
                </span>
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={!consentChecked}
                onClick={() => void continueAfterConsent()}
              >
                Continue to recording
              </button>
            </div>
          )}

          {(phase === "ready" || phase === "recording") && (
            <div className="record-box">
              <div
                className={`record-orb ${phase === "recording" ? "live" : ""}`}
                aria-hidden
              />
              <p className="timer" aria-live="polite">
                {phase === "recording" ? `${mm}:${ss}` : "00:00"}
              </p>
              <p className="muted">
                {phase === "ready"
                  ? "Uses this device’s microphone. Audio is buffered locally so you can retry if the network drops."
                  : "Listening… speak naturally with your patient."}
              </p>
              {micHint ? <p className="form-error">{micHint}</p> : null}
              {phase === "ready" ? (
                <button
                  type="button"
                  className="btn-primary record-btn"
                  onClick={() => void startRecording()}
                >
                  <Mic size={18} aria-hidden /> Start recording
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-danger record-btn"
                  onClick={() => void stopAndOrganise()}
                >
                  <Square size={16} aria-hidden /> Stop & organise note
                </button>
              )}
            </div>
          )}

          {phase === "recover" && (
            <div className="consent-box">
              <h3>Recording needs attention</h3>
              {recoverHint ? <p className="muted">{recoverHint}</p> : null}
              {error ? <p className="form-error">{error}</p> : null}
              <div className="apt-actions" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void retryFromBuffer()}
                >
                  <RefreshCw size={16} aria-hidden /> Retry upload & organise
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void discardLocalAndRecordAgain()}
                >
                  Record again
                </button>
              </div>
            </div>
          )}

          {phase === "processing" && (
            <div className="processing-box" aria-live="polite">
              <div className="pulse-bar" />
              <p>{statusLine || "Working…"}</p>
              <p className="muted">AI draft only — nothing is signed yet.</p>
            </div>
          )}

          {phase === "signed" && (
            <div className="signed-box">
              <Check size={28} aria-hidden />
              <h3>Note signed</h3>
              <p className="muted">
                Locked in the clinical record with an audit event.
              </p>

              {noteId ? <NotePrintActions noteId={noteId} /> : null}

              <div className="rebook-box">
                <h4>Correct record</h4>
                <p className="muted">
                  Signed notes stay immutable. Void with a reason, or add a
                  signed addendum.
                </p>
                <div className="apt-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setCorrectionOpen("addendum")}
                  >
                    Add addendum
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setCorrectionOpen("void")}
                  >
                    Void note
                  </button>
                </div>
                {correctionOpen === "void" ? (
                  <div style={{ marginTop: "0.75rem" }}>
                    <label className="note-field">
                      <span>Reason for voiding</span>
                      <textarea
                        rows={3}
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="e.g. Wrong patient / factual error — will re-document"
                      />
                    </label>
                    <div className="apt-actions">
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        disabled={
                          correctionBusy || voidReason.trim().length < 3
                        }
                        onClick={() => void voidNote()}
                      >
                        Confirm void
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setCorrectionOpen(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {correctionOpen === "addendum" ? (
                  <div style={{ marginTop: "0.75rem" }}>
                    <label className="note-field">
                      <span>Addendum text</span>
                      <textarea
                        rows={4}
                        value={addendumText}
                        onChange={(e) => setAddendumText(e.target.value)}
                        placeholder="Additional clinical information…"
                      />
                    </label>
                    <div className="apt-actions">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={correctionBusy || !addendumText.trim()}
                        onClick={() => void createAddendum()}
                      >
                        Create draft addendum
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setCorrectionOpen(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {error && phase === "signed" ? (
                  <p className="form-error">{error}</p>
                ) : null}
              </div>

              {visit?.appointment.id ? (
                <VisitInvoiceActions
                  visitId={visitId}
                  appointmentId={visit.appointment.id}
                />
              ) : null}

              {rebook && !rebookDone ? (
                <div className="rebook-box">
                  <h4>Suggest follow-up</h4>
                  <p className="muted">
                    From the plan (~{rebook.suggestedWeeks} weeks) ·{" "}
                    {rebook.appointmentTypeName}
                  </p>
                  {rebook.planExcerpt ? (
                    <p className="plan-excerpt">{rebook.planExcerpt}</p>
                  ) : null}
                  <div className="slot-grid">
                    {rebook.slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="slot"
                        disabled={rebookBusy}
                        onClick={() => void bookFollowUp(s)}
                      >
                        {new Date(s).toLocaleString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    ))}
                  </div>
                  {rebook.slots.length === 0 ? (
                    <p className="muted">No open slots in that window.</p>
                  ) : null}
                </div>
              ) : null}

              {rebookDone ? (
                <p className="alert-line">
                  Follow-up booked for{" "}
                  {new Date(rebookDone).toLocaleString("en-GB")}.
                </p>
              ) : null}

              <Link href="/app" className="btn-primary">
                Back to Today
              </Link>
              <Link href="/app/money" className="btn-secondary">
                Money desk
              </Link>
            </div>
          )}
        </section>

        <section className="note-panel">
          <div className="note-panel-head">
            <h3>Clinical note</h3>
            {phase === "review" && (
              <span className="badge-draft">AI draft — review required</span>
            )}
            {phase === "signed" && <span className="badge-signed">Signed</span>}
          </div>

          {fields.length === 0 && phase !== "review" && phase !== "signed" ? (
            <div className="note-placeholder">
              <p>
                After you stop recording, Treow organises a note from your clinic
                template. You review and sign.
              </p>
            </div>
          ) : null}

          {fields.length > 0 && (
            <div className="note-editor">
              {flags.length > 0 && (
                <div className="flag-banner" role="status">
                  <AlertTriangle size={16} aria-hidden />
                  {flags.join(" ")}
                </div>
              )}
              {fields.map((key) => (
                <label key={key} className="note-field">
                  <span>{titleCase(key)}</span>
                  <textarea
                    value={content[key] ?? ""}
                    onChange={(e) =>
                      setContent((c) => ({ ...c, [key]: e.target.value }))
                    }
                    readOnly={phase === "signed"}
                    rows={4}
                  />
                </label>
              ))}
              {phase === "review" && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void signNote()}
                >
                  Sign note
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function stringifyContent(raw: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "clinician_review_flags") continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function asFlags(raw: Record<string, unknown>) {
  const f = raw.clinician_review_flags;
  return Array.isArray(f) ? f.map(String) : [];
}

function titleCase(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
