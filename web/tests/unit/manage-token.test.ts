import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  createManageToken,
  manageTokenTtlMs,
  verifyManageToken,
} from "@/modules/scheduling/manage";

describe("manage tokens", () => {
  it("seals appointment id out of the URL token", () => {
    const id = "apt_privacy_probe_01";
    const token = createManageToken(id, Date.now() + 60_000);
    assert.equal(token.startsWith("v2."), true);
    assert.equal(token.includes(id), false);
    assert.equal(verifyManageToken(token).appointmentId, id);
  });

  it("rejects legacy id.exp.sig tokens", () => {
    const id = "apt_legacy_01";
    const exp = String(Date.now() + 60_000);
    const secret = process.env.AUTH_SECRET ?? "treow-dev-secret-change-me";
    const sig = createHmac("sha256", secret)
      .update(`${id}.${exp}`)
      .digest("base64url");
    const legacy = `${id}.${exp}.${sig}`;
    assert.throws(() => verifyManageToken(legacy), /no longer valid|Invalid/);
  });

  it("TTL is at least 7d and grows with cancel notice", () => {
    const week = 7 * 24 * 60 * 60_000;
    assert.equal(manageTokenTtlMs(24), week);
    assert.ok(manageTokenTtlMs(14 * 24) > week);
  });
});
