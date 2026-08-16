"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Check, AlertTriangle } from "lucide-react";
import type { SoapNoteContent } from "@/modules/ai/mock-pipeline";

type Phase =
  | "consent"
  | "ready"
  | "recording"
  | "processing"
  | "review"
  | "signed";

type Props = {
  appointmentId: string;
  patientName: string;
  appointmentType: string;
};

export function VisitRecorder({
  appointmentId,
  patientName,
  appointmentType,
}: Props) {
  const [phase, setPhase] = useState<Phase>("consent");
  const [consentChecked, setConsentChecked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<SoapNoteContent | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startRecording() {
    setPhase("recording");
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }

  async function stopAndOrganise() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("processing");
    setStatusLine("Uploading recording…");

    const res = await fetch("/api/ai/organise-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId,
        patientName,
        appointmentType,
      }),
    });

    setStatusLine("Transcribing…");
    await new Promise((r) => setTimeout(r, 400));
    setStatusLine("Organising clinical note…");

    const data = (await res.json()) as {
      note: SoapNoteContent;
      transcriptPreview: string;
    };
    setNote(data.note);
    setPhase("review");
  }

  function updateSection(key: keyof SoapNoteContent, value: string) {
    if (!note || key === "clinician_review_flags") return;
    setNote({ ...note, [key]: value });
  }

  function signNote() {
    setPhase("signed");
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="visit-layout">
      <section className="visit-panel">
        <p className="eyebrow">Visit mode</p>
        <h2>{patientName}</h2>
        <p className="muted">{appointmentType}</p>

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
                documentation. Consent will be stored on the visit record.
              </span>
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={!consentChecked}
              onClick={() => setPhase("ready")}
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
                ? "Tap start — you do not need to type during the visit."
                : "Listening… speak naturally with your patient."}
            </p>
            {phase === "ready" ? (
              <button
                type="button"
                className="btn-primary record-btn"
                onClick={startRecording}
              >
                <Mic size={18} aria-hidden /> Start recording
              </button>
            ) : (
              <button
                type="button"
                className="btn-danger record-btn"
                onClick={stopAndOrganise}
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
          </div>
        )}
      </section>

      <section className="note-panel">
        <div className="note-panel-head">
          <h3>Clinical note</h3>
          {phase === "review" && (
            <span className="badge-draft">AI draft — review required</span>
          )}
          {phase === "signed" && (
            <span className="badge-signed">Signed</span>
          )}
        </div>

        {!note && phase !== "review" && phase !== "signed" && (
          <div className="note-placeholder">
            <p>
              After you stop recording, Aether organises a SOAP note from the
              conversation. You review and sign — the blank page is gone.
            </p>
          </div>
        )}

        {note && (
          <div className="note-editor">
            {note.clinician_review_flags.length > 0 && (
              <div className="flag-banner" role="status">
                <AlertTriangle size={16} aria-hidden />
                {note.clinician_review_flags.join(" ")}
              </div>
            )}
            {(
              [
                ["subjective", "Subjective"],
                ["objective", "Objective"],
                ["assessment", "Assessment"],
                ["plan", "Plan"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="note-field">
                <span>{label}</span>
                <textarea
                  value={note[key]}
                  onChange={(e) => updateSection(key, e.target.value)}
                  readOnly={phase === "signed"}
                  rows={4}
                />
              </label>
            ))}
            {phase === "review" && (
              <button
                type="button"
                className="btn-primary"
                onClick={signNote}
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
