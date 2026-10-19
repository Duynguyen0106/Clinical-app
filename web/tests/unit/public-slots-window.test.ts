import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicSlotWindow } from "../../src/modules/scheduling/public-slot-window";

describe("publicSlotWindow", () => {
  it("keeps the clinic advance window but caps payload size", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60 });
    assert.equal(w.days, 60);
    assert.equal(w.maxPerDay, 8);
    assert.equal(w.limit, 480);
    assert.ok(w.limit <= 480);
    assert.ok(w.limit > 48, "must still cover more than a couple of days");
  });

  it("allows an explicit shorter days override", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60, days: 14 });
    assert.equal(w.days, 14);
    assert.equal(w.maxPerDay, 8);
    assert.equal(w.limit, 14 * 8);
  });

  it("caps the window at 90 days", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 120 });
    assert.equal(w.days, 90);
    assert.equal(w.limit, 480);
  });
});
