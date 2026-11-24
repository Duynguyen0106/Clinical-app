import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPercentOff } from "@/modules/billing/promo";

describe("applyPercentOff", () => {
  it("applies whole-number percent off in pence", () => {
    assert.equal(applyPercentOff(10000, 15), 8500);
    assert.equal(applyPercentOff(4999, 15), 4249);
  });

  it("leaves amount unchanged without a valid promo", () => {
    assert.equal(applyPercentOff(10000, null), 10000);
    assert.equal(applyPercentOff(10000, 0), 10000);
    assert.equal(applyPercentOff(10000, undefined), 10000);
  });

  it("clamps percent and never goes negative", () => {
    assert.equal(applyPercentOff(10000, 150), 0);
    assert.equal(applyPercentOff(0, 15), 0);
  });
});
