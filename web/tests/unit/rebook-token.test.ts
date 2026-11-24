import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WINBACK_PERCENT_OFF,
  createPatientWinBackUrl,
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
    assert.equal(token.startsWith("rb2."), true);
    assert.equal(token.includes(clinicId), false);
    assert.equal(token.includes(patientId), false);
    const payload = verifyRebookToken(token);
    assert.equal(payload.clinicId, clinicId);
    assert.equal(payload.patientId, patientId);
    assert.equal(payload.practitionerId, "prac_01");
    assert.equal(payload.percentOff, null);
  });

  it("carries percentOff for win-back promo links", () => {
    const token = createRebookToken(
      {
        clinicId: "c1",
        patientId: "p1",
        practitionerId: "prac_01",
        percentOff: WINBACK_PERCENT_OFF,
      },
      Date.now() + 60_000,
    );
    assert.equal(token.startsWith("rb2."), true);
    const payload = verifyRebookToken(token);
    assert.equal(payload.percentOff, 15);
  });

  it("clamps sealed percentOff to the max public promo", () => {
    const token = createRebookToken(
      {
        clinicId: "c1",
        patientId: "p1",
        percentOff: 90,
      },
      Date.now() + 60_000,
    );
    const payload = verifyRebookToken(token);
    assert.equal(payload.percentOff, WINBACK_PERCENT_OFF);
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

  it("win-back URL includes sealed promo rebook token", () => {
    const url = createPatientWinBackUrl({
      clinicSlug: "nguyens-osteopathy",
      clinicId: "c1",
      patientId: "p1",
      practitionerId: "prac_01",
    });
    assert.match(url, /\/book\/nguyens-osteopathy\?rebook=/);
    const token = decodeURIComponent(url.split("rebook=")[1]!);
    const payload = verifyRebookToken(token);
    assert.equal(payload.percentOff, WINBACK_PERCENT_OFF);
  });
});
