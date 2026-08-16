import { BRAND } from "@/modules/config/brand";
import Link from "next/link";

export const metadata = {
  title: `Privacy notice — ${BRAND.name}`,
};

export default function PrivacyPage() {
  return (
    <div className="book-page">
      <article className="book-card privacy-doc">
        <p className="brand-mark">{BRAND.shortName}</p>
        <h1>Privacy notice</h1>
        <p className="muted">UK · Version 2026-08-uk-v1 · Effective August 2026</p>

        <h2>Who we are</h2>
        <p>
          Treow Clinic provides practice management software for allied health
          clinics (physiotherapy, osteopathy, manual therapy) in the United
          Kingdom. Your clinic is the data controller for patient records. Treow
          acts as a processor when hosting the service.
        </p>

        <h2>What we process</h2>
        <ul>
          <li>Identity and contact details</li>
          <li>Appointment and billing records</li>
          <li>Clinical notes and transcripts</li>
          <li>
            Optional consultation audio (encrypted at rest), used only to draft
            notes
          </li>
          <li>Consents you provide (privacy, recording)</li>
        </ul>

        <h2>Lawful basis</h2>
        <p>
          Processing for care delivery and clinic administration is based on{" "}
          <strong>legitimate interests</strong> and, where applicable,{" "}
          <strong>provision of health care</strong> (UK GDPR Art. 9(2)(h) via
          the clinic). Recording uses <strong>consent</strong>, captured before
          each recording and auditable on the visit.
        </p>

        <h2>Audio & AI drafts</h2>
        <p>
          Audio is encrypted at rest. Clinics configure retention (default 14
          days); after that audio is deleted while signed notes remain. AI drafts
          are labelled until a clinician signs — the clinician remains
          responsible for the clinical record.
        </p>

        <h2>Your rights</h2>
        <p>
          You may request access, rectification, erasure (where applicable),
          restriction, or objection via the clinic. You can complain to the ICO
          (ico.org.uk).
        </p>

        <h2>International transfers</h2>
        <p>
          We prefer UK/EU hosting and vendors with UK GDPR DPAs. Sub-processors
          (e.g. email, optional STT/LLM) are listed in the clinic&apos;s
          processing record.
        </p>

        <p className="muted">
          This notice is a product template for beta — clinics should review
          with their adviser before go-live.
        </p>

        <Link href="/" className="btn-ghost">
          Back
        </Link>
        <Link href="/book/northbank-manual" className="btn-primary">
          Continue to booking
        </Link>
      </article>
    </div>
  );
}
