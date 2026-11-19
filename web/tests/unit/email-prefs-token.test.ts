import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmailPrefsToken,
  verifyEmailPrefsToken,
  emailPrefsUrlForToken,
} from "@/modules/notifications/email-prefs-token";

describe("email prefs token", () => {
  it("round-trips patient and clinic ids", () => {
    const secret = process.env.AUTH_SECRET ?? "treow-dev-secret-change-me";
    process.env.AUTH_SECRET = secret;
    const token = createEmailPrefsToken("pat_1", "clinic_1");
    assert.match(token, /^v2\./);
    const parsed = verifyEmailPrefsToken(token);
    assert.equal(parsed.patientId, "pat_1");
    assert.equal(parsed.clinicId, "clinic_1");
  });

  it("builds prefs URL", () => {
    process.env.APP_BASE_URL = "https://app.example";
    const url = emailPrefsUrlForToken("v2.abc");
    assert.equal(url, "https://app.example/book/email-prefs/v2.abc");
  });
});
