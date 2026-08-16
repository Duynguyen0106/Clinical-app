"use client";

import { useEffect, useState } from "react";
import { Printer, FileText, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type ClinicalDocument = {
  kind: "clinical_note";
  noteId: string;
  signedAt: string | null;
  clinic: { name: string };
  patient: {
    fullName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
  };
  practitioner: { displayName: string } | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  templateName: string | null;
  sections: { key: string; label: string; value: string }[];
  printedAt: string;
};

type GpLetterDocument = {
  kind: "gp_letter";
  noteId: string;
  clinic: { name: string };
  patient: { fullName: string; dateOfBirth: string | null };
  practitioner: { displayName: string } | null;
  serviceName: string | null;
  appointmentStartsAt: string | null;
  gp: { name: string | null; practice: string | null; email: string | null };
  subject: string;
  body: string;
  signedAt: string | null;
  printedAt: string;
};

type Doc = ClinicalDocument | GpLetterDocument;

type Props = {
  noteId: string;
  /** Compact buttons for prep panel */
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

export function NotePrintActions({ noteId, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"clinical_note" | "gp_letter">(
    "clinical_note",
  );
  const [doc, setDoc] = useState<Doc | null>(null);
  const [letterBody, setLetterBody] = useState("");
  const [letterSubject, setLetterSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setError(null);
    void api<{ document: Doc }>(
      `/notes/${noteId}/document?kind=${kind}`,
    )
      .then((d) => {
        setDoc(d.document);
        if (d.document.kind === "gp_letter") {
          setLetterBody(d.document.body);
          setLetterSubject(d.document.subject);
        }
      })
      .catch((e: Error) =>
        setError(e instanceof ApiError ? e.message : e.message),
      )
      .finally(() => setBusy(false));
  }, [open, noteId, kind]);

  function openKind(next: "clinical_note" | "gp_letter") {
    setKind(next);
    setOpen(true);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <div className={`note-print-actions ${compact ? "compact" : ""}`}>
        <button
          type="button"
          className={compact ? "btn-ghost btn-sm" : "btn-secondary"}
          onClick={() => openKind("clinical_note")}
        >
          <Printer size={16} aria-hidden /> Print note
        </button>
        <button
          type="button"
          className={compact ? "btn-ghost btn-sm" : "btn-secondary"}
          onClick={() => openKind("gp_letter")}
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
            aria-label={kind === "gp_letter" ? "GP letter" : "Clinical note"}
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
                  onClick={handlePrint}
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

            {error ? <p className="form-error no-print">{error}</p> : null}
            {busy && !doc ? (
              <p className="muted no-print">Preparing document…</p>
            ) : null}

            {doc ? (
              <div className="print-document">
                {doc.kind === "clinical_note" ? (
                  <ClinicalNotePrint doc={doc} />
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

function ClinicalNotePrint({ doc }: { doc: ClinicalDocument }) {
  return (
    <article className="print-sheet">
      <header className="print-head">
        <p className="print-clinic">{doc.clinic.name}</p>
        <h1>Clinical note</h1>
        <p className="print-meta">
          {doc.templateName ?? "Consultation"} · Signed{" "}
          {formatDate(doc.signedAt)}
        </p>
      </header>
      <section className="print-block">
        <h2>Patient</h2>
        <p>
          <strong>{doc.patient.fullName}</strong>
        </p>
        <p>
          DOB {formatDate(doc.patient.dateOfBirth)}
          {doc.patient.phone ? ` · ${doc.patient.phone}` : ""}
          {doc.patient.email ? ` · ${doc.patient.email}` : ""}
        </p>
        <p>
          {doc.serviceName ?? "Visit"}
          {doc.appointmentStartsAt
            ? ` · ${formatDate(doc.appointmentStartsAt)}`
            : ""}
          {doc.practitioner
            ? ` · ${doc.practitioner.displayName}`
            : ""}
        </p>
      </section>
      {doc.sections.map((s) => (
        <section key={s.key} className="print-block">
          <h2>{s.label}</h2>
          <p className="print-body">{s.value}</p>
        </section>
      ))}
      <footer className="print-foot">
        <p>
          Signed clinical record · {doc.clinic.name} · Printed{" "}
          {formatDate(doc.printedAt)}
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

  return (
    <article className="print-sheet">
      <header className="print-head">
        <p className="print-clinic">{doc.clinic.name}</p>
        <h1>Letter to GP</h1>
        <p className="print-meta">
          From {doc.practitioner?.displayName ?? "Treating clinician"}
          {doc.signedAt ? ` · based on note signed ${formatDate(doc.signedAt)}` : ""}
        </p>
      </header>

      <section className="print-block">
        <p>
          <strong>To:</strong> {gpLine || "Usual GP / practice"}
        </p>
        <p>
          <strong>Re:</strong> {doc.patient.fullName}
          {doc.patient.dateOfBirth
            ? ` (DOB ${formatDate(doc.patient.dateOfBirth)})`
            : ""}
        </p>
      </section>

      <section className="print-block no-print">
        <label className="note-field">
          <span>Subject</span>
          <input
            value={subject}
            onChange={(e) => onSubject(e.target.value)}
          />
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
          {doc.clinic.name} · Printed {formatDate(doc.printedAt)}
        </p>
      </footer>
    </article>
  );
}
