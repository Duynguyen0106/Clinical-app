import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRebookToken,
  verifyRebookToken,
  rebookUrlForToken,
} from "@/modules/scheduling/rebook-token";

describe("rebook tokens", () => {
  it("seals clinic + patient ids out of the URL token", () => {
    const clinicId = "clinic_privacy_01";
    const patientId = "patient_privacy_01";
    const token = createRebookToken(
      { clinicId, patientId, practitionerId: "prac_01" },
      Date.now() + 60_000,
    );
    assert.equal(token.startsWith("rb1."), true);
    assert.equal(token.includes(clinicId), false);
    assert.equal(token.includes(patientId), false);
    const payload = verifyRebookToken(token);
    assert.equal(payload.clinicId, clinicId);
    assert.equal(payload.patientId, patientId);
    assert.equal(payload.practitionerId, "prac_01");
  });

  it("rejects expired tokens", () => {
    const token = createRebookToken(
      { clinicId: "c1", patientId: "p1" },
      Date.now() - 1000,
    );
    assert.throws(() => verifyRebookToken(token), /expired/i);
  });

  it("builds book URL with rebook query", () => {
    const token = createRebookToken({ clinicId: "c1", patientId: "p1" });
    const url = rebookUrlForToken("nguyens-osteopathy", token);
    assert.match(url, /\/book\/nguyens-osteopathy\?rebook=/);
  });
});
