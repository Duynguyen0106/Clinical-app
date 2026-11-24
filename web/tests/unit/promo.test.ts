import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPercentOff,
  clampPromoPercentOff,
} from "@/modules/billing/promo";

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

  it("caps at the max public promo (15%) and never goes negative", () => {
    assert.equal(clampPromoPercentOff(90), 15);
    // 50% or 100% in a forged token must not wipe the fee
    assert.equal(applyPercentOff(10000, 50), 8500);
    assert.equal(applyPercentOff(10000, 100), 8500);
    assert.equal(applyPercentOff(10000, 150), 8500);
    assert.equal(applyPercentOff(0, 15), 0);
  });
});
