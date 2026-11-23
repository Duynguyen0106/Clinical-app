import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normaliseEmail,
  normalisePhone,
  phoneDigits,
} from "@/modules/patients/match";

describe("patient identity normalise", () => {
  it("lowercases and trims email", () => {
    assert.equal(normaliseEmail("  Alice@Example.COM "), "alice@example.com");
    assert.equal(normaliseEmail(""), null);
    assert.equal(normaliseEmail(null), null);
  });

  it("normalises UK phones to +44", () => {
    assert.equal(normalisePhone("07882843513"), "+447882843513");
    assert.equal(normalisePhone("+44 7882 843513"), "+447882843513");
    assert.equal(normalisePhone("447882843513"), "+447882843513");
    assert.equal(normalisePhone("  "), null);
  });

  it("phoneDigits strips to digits", () => {
    assert.equal(phoneDigits("07882 843513"), "447882843513");
    assert.equal(phoneDigits("+44 7882 843513"), "447882843513");
  });
});
