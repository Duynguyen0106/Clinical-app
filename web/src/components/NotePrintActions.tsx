"use client";

import { useEffect, useState } from "react";
import { Printer, FileText, X, Share2, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  BodyChartCustomView,
  BodyMapContent,
} from "@/modules/notes/body-map";
import { BODY_MAP_CONTENT_KEY } from "@/modules/notes/body-map";
import { BodyMapPrintFigure } from "@/components/body-map/BodyMapPrintFigure";

type LetterheadClinic = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  brandColour?: string | null;
  logoDataUrl?: string | null;
};

type LetterheadPractitioner = {
  displayName: string;
  professionalTitle: string | null;
  registrationBody: string | null;
  registrationNumber: string | null;
};

type ClinicalDocument = {
  kind: "clinical_note";
  noteId: string;
  reference: string;
  signedAt: string | null;
  signedByName: string | null;
  clinic: LetterheadClinic;
  patient: {
    fullName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    nhsNumber: string | null;
  };
  practitioner: LetterheadPractitioner | null;
  locationName: string | null;
  locationAddress: string | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  templateName: string | null;
  sections: { key: string; label: string; value: string }[];
  bodyMap?: BodyMapContent | null;
  bodyChartCustomViews?: BodyChartCustomView[];
  printedAt: string;
};

type PatientCopyDocument = {
  kind: "patient_copy";
  noteId: string;
  reference: string;
  signedAt: string | null;
  signedByName: string | null;
  clinic: LetterheadClinic;
  patient: {
    fullName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    nhsNumber: string | null;
  };
  practitioner: LetterheadPractitioner | null;
  locationName: string | null;
  locationAddress: string | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  templateName: string | null;
  sections: { key: string; label: string; value: string }[];
  bodyMap?: BodyMapContent | null;
  bodyChartCustomViews?: BodyChartCustomView[];
  printedAt: string;
};

type GpLetterDocument = {
  kind: "gp_letter";
  noteId: string;
  reference: string;
  clinic: LetterheadClinic;
  patient: {
    fullName: string;
    dateOfBirth: string | null;
    nhsNumber: string | null;
  };
  practitioner: LetterheadPractitioner | null;
  signedByName: string | null;
  locationName: string | null;
  locationAddress: string | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  gp: { name: string | null; practice: string | null; email: string | null };
  subject: string;
  body: string;
  signedAt: string | null;
  printedAt: string;
};

type Doc = ClinicalDocument | GpLetterDocument | PatientCopyDocument;
type DocKind = "clinical_note" | "gp_letter" | "patient_copy";

type Props = {
  noteId: string;
  compact?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function registrationLine(p: LetterheadPractitioner | null) {
  if (!p) return null;
  if (p.registrationBody && p.registrationNumber) {
    return `${p.registrationBody} ${p.registrationNumber}`;
  }
  return p.registrationNumber;
}

function ClinicLetterhead({
  clinic,
  reference,
}: {
  clinic: LetterheadClinic;
  reference: string;
}) {
  const accent = clinic.brandColour || undefined;
  return (
    <header className="print-head">
      <div
        className="print-letterhead"
        style={accent ? { borderBottomColor: accent } : undefined}
      >
        <div className="print-letterhead-main">
          {clinic.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- print data URL
            <img
              src={clinic.logoDataUrl}
              alt=""
              className="print-clinic-logo"
            />
          ) : null}
          <div>
            <p
              className="print-clinic"
              style={accent ? { color: accent } : undefined}
            >
              {clinic.name}
            </p>
            {clinic.address ? (
              <p className="print-contact">{clinic.address}</p>
            ) : null}
            <p className="print-contact">
              {[clinic.phone ? `Tel ${clinic.phone}` : null, clinic.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <p className="print-ref">Ref {reference}</p>
      </div>
    </header>
  );
}

export function NotePrintActions({ noteId, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocKind>("clinical_note");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [letterBody, setLetterBody] = useState("");
  const [letterSubject, setLetterSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareTo, setShareTo] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setError(null);
    setShareMsg(null);
    void api<{ document: Doc }>(`/notes/${noteId}/document?kind=${kind}`)
      .then((d) => {
        setDoc(d.document);
        if (d.document.kind === "gp_letter") {
          setLetterBody(d.document.body);
          setLetterSubject(d.document.subject);
        }
        if (d.document.kind === "patient_copy") {
          setShareTo(d.document.patient.email ?? "");
        }
      })
      .catch((e: Error) =>
        setError(e instanceof ApiError ? e.message : e.message),
      )
      .finally(() => setBusy(false));
  }, [open, noteId, kind]);

  function openKind(next: DocKind) {
    setError(null);
    setShareMsg(null);
    setKind(next);
    setDoc(null);
    setOpen(true);
  }

  async function emailPatientCopy() {
    if (shareBusy) return;
    const to = shareTo.trim();
    if (!to) {
      setError("Enter an email address to share with the patient");
      return;
    }
    setShareBusy(true);
    setError(null);
    setShareMsg(null);
    try {
      const data = await api<{
        share: { to: string; delivered: boolean; reference: string };
      }>(`/notes/${noteId}/share`, {
        method: "POST",
        body: JSON.stringify({ channel: "email", to }),
      });
      setShareMsg(
        data.share.delivered
          ? `Sent to ${data.share.to}`
          : `Queued for ${data.share.to} (console provider)`,
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not email patient copy",
      );
    } finally {
      setShareBusy(false);
    }
  }

  const dialogLabel =
    kind === "gp_letter"
      ? "GP letter"
      : kind === "patient_copy"
        ? "Patient copy"
        : "Clinical note";

  return (
    <>
      <div className={`note-print-actions ${compact ? "compact" : ""}`}>
        <button
          type="button"
          className={compact ? "btn-ghost btn-sm" : "btn-secondary"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openKind("clinical_note");
          }}
        >
          <Printer size={16} aria-hidden /> Print note
        </button>
        <button
          type="button"
          className={compact ? "btn-ghost btn-sm" : "btn-secondary"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openKind("patient_copy");
          }}
        >
          <Share2 size={16} aria-hidden /> Share with patient
        </button>
        <button
          type="button"
          className={compact ? "btn-ghost btn-sm" : "btn-secondary"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openKind("gp_letter");
          }}
        >
          <FileText size={16} aria-hidden /> GP letter
        </button>
      </div>

      {open ? (
        <div className="doc-modal-backdrop" role="presentation">
          <div
            className="doc-modal"
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
          >
            <div className="doc-modal-toolbar no-print">
              <div className="view-toggle" role="group">
                <button
                  type="button"
                  className={`btn-sm ${kind === "clinical_note" ? "btn-secondary" : "btn-ghost"}`}
                  onClick={() => setKind("clinical_note")}
                >
                  Clinical note
                </button>
                <button
                  type="button"
                  className={`btn-sm ${kind === "patient_copy" ? "btn-secondary" : "btn-ghost"}`}
                  onClick={() => setKind("patient_copy")}
                >
                  Patient copy
                </button>
                <button
                  type="button"
                  className={`btn-sm ${kind === "gp_letter" ? "btn-secondary" : "btn-ghost"}`}
                  onClick={() => setKind("gp_letter")}
                >
                  GP letter
                </button>
              </div>
              <div className="doc-modal-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => window.print()}
                  disabled={!doc || busy}
                >
                  <Printer size={14} aria-hidden /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {kind === "patient_copy" ? (
              <div className="no-print" style={{ marginBottom: "0.75rem" }}>
                <label className="note-field">
                  <span>Email patient copy to</span>
                  <input
                    type="email"
                    value={shareTo}
                    onChange={(e) => setShareTo(e.target.value)}
                    placeholder="patient@example.com"
                    autoComplete="email"
                  />
                </label>
                <div className="apt-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={!doc || busy || shareBusy || !shareTo.trim()}
                    onClick={() => void emailPatientCopy()}
                  >
                    <Mail size={14} aria-hidden />{" "}
                    {shareBusy ? "Sending…" : "Email patient"}
                  </button>
                </div>
                {shareMsg ? (
                  <p className="muted" role="status">
                    {shareMsg}
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="form-error no-print">{error}</p> : null}
            {busy && !doc ? (
              <p className="muted no-print">Preparing document…</p>
            ) : null}

            {doc ? (
              <div className="print-document">
                {doc.kind === "clinical_note" ? (
                  <ClinicalNotePrint doc={doc} title="Clinical note" />
                ) : doc.kind === "patient_copy" ? (
                  <ClinicalNotePrint
                    doc={doc}
                    title="Visit summary for patient"
                  />
                ) : (
                  <GpLetterPrint
                    doc={doc}
                    subject={letterSubject}
                    body={letterBody}
                    onSubject={setLetterSubject}
                    onBody={setLetterBody}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function ClinicalNotePrint({
  doc,
  title,
}: {
  doc: ClinicalDocument | PatientCopyDocument;
  title: string;
}) {
  const reg = registrationLine(doc.practitioner);
  return (
    <article className="print-sheet">
      <ClinicLetterhead clinic={doc.clinic} reference={doc.reference} />
      <h1>{title}</h1>
      <p className="print-meta">
        {doc.templateName ?? "Consultation"} · Signed{" "}
        {formatDateTime(doc.signedAt)}
        {doc.signedByName ? ` by ${doc.signedByName}` : ""}
      </p>

      <section className="print-block">
        <h2>Patient</h2>
        <p>
          <strong>{doc.patient.fullName}</strong>
        </p>
        <p>
          DOB {formatDate(doc.patient.dateOfBirth)}
          {doc.patient.nhsNumber ? ` · NHS ${doc.patient.nhsNumber}` : ""}
        </p>
        <p>
          {[doc.patient.phone, doc.patient.email].filter(Boolean).join(" · ") ||
            "No contact on file"}
        </p>
      </section>

      <section className="print-block">
        <h2>Visit</h2>
        <p>
          {doc.serviceName ?? "Visit"} · {formatDateTime(doc.appointmentStartsAt)}
        </p>
        <p>
          {doc.practitioner?.displayName ?? "Practitioner"}
          {doc.practitioner?.professionalTitle
            ? ` · ${doc.practitioner.professionalTitle}`
            : ""}
          {reg ? ` · ${reg}` : ""}
        </p>
        {(doc.locationName || doc.locationAddress || doc.clinic.address) && (
          <p>
            {[doc.locationName, doc.locationAddress || doc.clinic.address]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      {doc.sections.map((s) => (
        <section key={s.key} className="print-block">
          <h2>{s.label}</h2>
          {s.key === BODY_MAP_CONTENT_KEY && doc.bodyMap ? (
            <BodyMapPrintFigure
              map={doc.bodyMap}
              customViews={doc.bodyChartCustomViews}
            />
          ) : null}
          <p className="print-body">{s.value}</p>
        </section>
      ))}

      <footer className="print-foot">
        <p>
          Signed by {doc.signedByName ?? doc.practitioner?.displayName ?? "—"}
          {doc.signedAt ? ` on ${formatDateTime(doc.signedAt)}` : ""}
        </p>
        <p>
          {doc.clinic.name} · Ref {doc.reference} · Printed{" "}
          {formatDateTime(doc.printedAt)}
        </p>
      </footer>
    </article>
  );
}

function GpLetterPrint({
  doc,
  subject,
  body,
  onSubject,
  onBody,
}: {
  doc: GpLetterDocument;
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
}) {
  const gpLine = [doc.gp.name, doc.gp.practice, doc.gp.email]
    .filter(Boolean)
    .join(" · ");
  const reg = registrationLine(doc.practitioner);

  return (
    <article className="print-sheet">
      <ClinicLetterhead clinic={doc.clinic} reference={doc.reference} />
      <h1>Letter to GP</h1>
      <p className="print-meta">
        From {doc.practitioner?.displayName ?? "Treating clinician"}
        {doc.practitioner?.professionalTitle
          ? ` · ${doc.practitioner.professionalTitle}`
          : ""}
        {reg ? ` · ${reg}` : ""}
        {doc.signedAt
          ? ` · based on note signed ${formatDateTime(doc.signedAt)}`
          : ""}
      </p>

      <section className="print-block">
        <p>
          <strong>To:</strong> {gpLine || "Usual GP / practice"}
        </p>
        <p>
          <strong>Re:</strong> {doc.patient.fullName}
          {doc.patient.dateOfBirth
            ? ` (DOB ${formatDate(doc.patient.dateOfBirth)})`
            : ""}
          {doc.patient.nhsNumber ? ` · NHS ${doc.patient.nhsNumber}` : ""}
        </p>
        <p>
          <strong>Visit:</strong> {doc.serviceName ?? "Consultation"} ·{" "}
          {formatDateTime(doc.appointmentStartsAt)}
        </p>
      </section>

      <section className="print-block no-print">
        <label className="note-field">
          <span>Subject</span>
          <input value={subject} onChange={(e) => onSubject(e.target.value)} />
        </label>
        <label className="note-field">
          <span>Letter body — edit before printing</span>
          <textarea
            rows={16}
            value={body}
            onChange={(e) => onBody(e.target.value)}
          />
        </label>
        {!gpLine ? (
          <p className="muted">
            Tip: add the patient’s GP on the patient record for a complete
            letterhead.
          </p>
        ) : null}
      </section>

      <section className="print-block print-only">
        <p>
          <strong>Subject:</strong> {subject}
        </p>
        <p className="print-body print-letter-body">{body}</p>
      </section>

      <footer className="print-foot">
        <p>
          Signed by {doc.signedByName ?? doc.practitioner?.displayName ?? "—"}
          {reg ? ` · ${reg}` : ""}
        </p>
        <p>
          {doc.clinic.name} · Ref {doc.reference} · Printed{" "}
          {formatDateTime(doc.printedAt)}
        </p>
      </footer>
    </article>
  );
}
