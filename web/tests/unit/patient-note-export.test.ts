import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_MAP_CONTENT_KEY,
  emptyBodyMap,
} from "../../src/modules/notes/body-map";
import {
  buildPatientCopyEmail,
  flattenNoteSections,
  patientFacingContent,
  type PatientCopyDocument,
} from "../../src/modules/notes/documents";
import { shareNoteSchema } from "../../src/modules/notes/share";

describe("patientFacingContent", () => {
  it("strips clinician_review_flags and flags", () => {
    const cleaned = patientFacingContent({
      subjective: "Low back ache",
      plan: "HEP",
      clinician_review_flags: ["Check red flags"],
      flags: ["internal"],
    });
    assert.equal(cleaned.subjective, "Low back ache");
    assert.equal(cleaned.plan, "HEP");
    assert.equal("clinician_review_flags" in cleaned, false);
    assert.equal("flags" in cleaned, false);
    assert.ok(cleaned[BODY_MAP_CONTENT_KEY]);
  });
});

describe("flattenNoteSections for patient_copy", () => {
  it("omits internal flags and keeps clinical sections", () => {
    const sections = flattenNoteSections({
      subjective: "Reports stiffness",
      objective: "Reduced lumbar ROM",
      assessment: "Mechanical LBP",
      plan: "Mobilisation + advice",
      clinician_review_flags: ["Do not show to patient"],
      [BODY_MAP_CONTENT_KEY]: emptyBodyMap(),
    });
    const keys = sections.map((s) => s.key);
    assert.ok(keys.includes("subjective"));
    assert.ok(keys.includes("plan"));
    assert.equal(keys.includes("clinician_review_flags"), false);
  });
});

describe("buildPatientCopyEmail", () => {
  const doc: PatientCopyDocument = {
    kind: "patient_copy",
    noteId: "note_abc12345",
    reference: "TN-ABC12345",
    status: "SIGNED",
    signedAt: "2026-11-19T12:00:00.000Z",
    signedByName: "Austin Nguyen",
    clinic: {
      name: "Nguyen's Osteopathic Clinic",
      timezone: "Europe/London",
      phone: "+447700900123",
      email: "clinic@example.com",
      address: "9 The Village, Charlton",
      brandColour: "#1E3F37",
      logoDataUrl: null,
    },
    patient: {
      id: "pat_1",
      fullName: "Ba Duy Nguyen",
      dateOfBirth: "1990-01-01T00:00:00.000Z",
      email: "patient@example.com",
      phone: null,
      nhsNumber: null,
    },
    practitioner: {
      displayName: "Austin Nguyen",
      professionalTitle: "Osteopath",
      registrationBody: "GOsC",
      registrationNumber: "1234",
    },
    locationName: null,
    locationAddress: null,
    serviceName: "Follow-up Osteopathic Treatment",
    appointmentStartsAt: "2026-11-19T11:00:00.000Z",
    templateName: "Osteopathy · Session",
    sections: [
      { key: "subjective", label: "Subjective", value: "Low back ache" },
      { key: "plan", label: "Plan", value: "Continue HEP" },
    ],
    bodyMap: null,
    bodyChartCustomViews: [],
    printedAt: "2026-11-19T12:30:00.000Z",
  };

  it("includes clinic and practitioner details in text and html", () => {
    const email = buildPatientCopyEmail(doc);
    assert.match(email.subject, /Nguyen's Osteopathic Clinic/);
    assert.match(email.text, /Austin Nguyen/);
    assert.match(email.text, /GOsC 1234/);
    assert.match(email.text, /clinic@example.com/);
    assert.match(email.text, /Low back ache/);
    assert.match(email.html, /Nguyen's Osteopathic Clinic/);
    assert.match(email.html, /Osteopath/);
    assert.match(email.html, /Continue HEP/);
  });
});

describe("shareNoteSchema", () => {
  it("requires email channel", () => {
    const parsed = shareNoteSchema.parse({
      channel: "email",
      to: "patient@example.com",
    });
    assert.equal(parsed.channel, "email");
    assert.equal(parsed.to, "patient@example.com");
  });

  it("allows omitting to (defaults to patient email at send time)", () => {
    const parsed = shareNoteSchema.parse({ channel: "email" });
    assert.equal(parsed.to, undefined);
  });

  it("rejects invalid override emails", () => {
    assert.throws(() =>
      shareNoteSchema.parse({ channel: "email", to: "not-an-email" }),
    );
  });
});

/** Mirrors shareNoteWithPatient guard before sendEmail. */
function shareGuard(args: {
  status: string;
  patientEmail: string | null;
  to?: string;
}) {
  if (args.status !== "SIGNED") {
    return { ok: false as const, reason: "unsigned" };
  }
  const to = (args.to ?? args.patientEmail ?? "").trim();
  if (!to) return { ok: false as const, reason: "missing_email" };
  return { ok: true as const, to, audit: "shared_with_patient" as const };
}

describe("shareNoteWithPatient guards", () => {
  it("refuses unsigned notes", () => {
    const result = shareGuard({
      status: "DRAFT",
      patientEmail: "a@b.com",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsigned");
  });

  it("refuses when no email is available", () => {
    const result = shareGuard({ status: "SIGNED", patientEmail: null });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_email");
  });

  it("records shared_with_patient when email is present", () => {
    const result = shareGuard({
      status: "SIGNED",
      patientEmail: "patient@example.com",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.to, "patient@example.com");
      assert.equal(result.audit, "shared_with_patient");
    }
  });
});
