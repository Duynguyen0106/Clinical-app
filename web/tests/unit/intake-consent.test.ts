import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createIntakeToken,
  verifyIntakeToken,
} from "../../src/modules/intake/token";
import {
  intakeCompleteSchema,
  OSTEO_CONSENT_FORM_KEY,
  OSTEO_TREATMENT_CONSENT_TEXT,
} from "../../src/modules/intake/schema";
import { buildIntakeConsentEmail } from "../../src/modules/notifications/intake-consent-email";

describe("intake consent tokens", () => {
  it("seals submission id out of the URL token", () => {
    const id = "sub_consent_probe_01";
    const token = createIntakeToken(id, Date.now() + 60_000);
    assert.equal(token.startsWith("v2."), true);
    assert.equal(token.includes(id), false);
    assert.equal(verifyIntakeToken(token).submissionId, id);
  });

  it("rejects expired tokens", () => {
    const token = createIntakeToken("sub_expired", Date.now() - 1000);
    assert.throws(() => verifyIntakeToken(token), /expired|Invalid/);
  });

  it("rejects non-v2 tokens", () => {
    assert.throws(() => verifyIntakeToken("legacy.bad.token"), /no longer valid|Invalid/);
  });
});

describe("intake consent schema", () => {
  it("requires privacy + treatment + signature", () => {
    const ok = intakeCompleteSchema.parse({
      token: "v2.abc12345",
      answers: { safetyNote: "Penicillin" },
      privacyConsent: true,
      treatmentConsent: true,
      marketingConsent: false,
      signatureName: "Mina Patel",
    });
    assert.equal(ok.signatureName, "Mina Patel");
    assert.equal(ok.answers.safetyNote, "Penicillin");
  });

  it("rejects missing treatment consent", () => {
    assert.throws(() =>
      intakeCompleteSchema.parse({
        token: "v2.abc12345",
        privacyConsent: true,
        treatmentConsent: false,
        signatureName: "Mina Patel",
      }),
    );
  });

  it("exports osteopathic consent copy and form key", () => {
    assert.equal(OSTEO_CONSENT_FORM_KEY, "osteo_consent_v1");
    assert.match(OSTEO_TREATMENT_CONSENT_TEXT, /osteopathic/i);
    assert.match(OSTEO_TREATMENT_CONSENT_TEXT, /stop at any time/i);
  });
});

describe("intake consent email", () => {
  it("builds subject and CTA", () => {
    const content = buildIntakeConsentEmail({
      clinicName: "Harbour Osteopathy",
      patientFirstName: "Mina",
      intakeLink: "https://example.com/book/intake/v2.token",
      whenLabel: "Monday 1 Jan 2026 at 10:00",
      practitionerName: "Dr Lee",
      serviceName: "Osteopathy",
    });
    assert.match(content.subject, /consent forms/i);
    assert.match(content.text, /Harbour Osteopathy/);
    assert.match(content.text, /https:\/\/example.com\/book\/intake\/v2.token/);
    assert.match(content.html, /Open consent forms/);
    assert.match(content.html, /2 minutes/);
  });
});
