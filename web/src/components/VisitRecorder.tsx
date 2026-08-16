"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Check, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

type Phase =
  | "loading"
  | "consent"
  | "ready"
  | "recording"
  | "processing"
  | "review"
  | "signed"
  | "error";

type VisitPayload = {
  id: string;
  recordingConsentAt: string | null;
  appointment: {
    patient: { firstName: string; lastName: string };
    appointmentType: { name: string };
  };
  notes: Array<{
    id: string;
    status: string;
    content: Record<string, unknown>;
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    void api<{ visit: VisitPayload }>(`/visits/${visitId}`)
      .then(({ visit: v }) => {
        setVisit(v);
        const draft = v.notes.find((n) => n.status === "DRAFT");
        const signed = v.notes.find((n) => n.status === "SIGNED");
        if (signed) {
          setNoteId(signed.id);
          setContent(stringifyContent(signed.content));
          setPhase("signed");
        } else if (draft) {
          setNoteId(draft.id);
          setContent(stringifyContent(draft.content));
          setFlags(asFlags(draft.content));
          setPhase("review");
        } else if (v.recordingConsentAt) {
          setPhase("ready");
        } else {
          setPhase("consent");
        }
      })
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });

    return () => {
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

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      await api(`/visits/${visitId}/recording`, { method: "POST" });
      recorder.start(1000);
      setPhase("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setMicHint(
        "Microphone permission is required. Allow mic access and try again — Treow works as a PWA on your phone too.",
      );
    }
  }

  async function stopAndOrganise() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    setPhase("processing");
    setStatusLine("Finalising audio…");

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStatusLine("Uploading recording…");
    const form = new FormData();
    form.append("audio", blob, "visit.webm");
    await api(`/visits/${visitId}/recording/upload`, {
      method: "POST",
      body: form,
    });

    setStatusLine("Transcribing & organising note…");
    const result = await api<{
      note: { id: string; content: Record<string, unknown> };
    }>(`/visits/${visitId}/recording`, {
      method: "PATCH",
      body: JSON.stringify({ durationSec: elapsed || 1 }),
    });

    setNoteId(result.note.id);
    setContent(stringifyContent(result.note.content));
    setFlags(asFlags(result.note.content));
    setPhase("review");
  }

  async function signNote() {
    if (!noteId) return;
    await api(`/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
    await api(`/notes/${noteId}/sign`, { method: "POST" });
    setPhase("signed");
  }

  const patientName = visit
    ? `${visit.appointment.patient.firstName} ${visit.appointment.patient.lastName}`
    : "…";
  const appointmentType = visit?.appointment.appointmentType.name ?? "";

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const fields = Object.keys(content).filter((k) => k !== "clinician_review_flags");

  return (
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
                ? "Uses this device’s microphone. Install Treow as an app for phone visits."
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
            <Link href="/app" className="btn-primary">
              Back to Today
            </Link>
            <Link href="/app/money" className="btn-secondary">
              Mark invoice paid
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
