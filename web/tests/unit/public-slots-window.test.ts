import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicSlotWindow } from "../../src/modules/scheduling/public-slot-window";

describe("publicSlotWindow", () => {
  it("keeps the clinic advance window with a full-day 15-minute cap", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60 });
    assert.equal(w.days, 60);
    assert.equal(w.maxPerDay, 32);
    assert.equal(w.limit, 960);
    assert.ok(
      w.maxPerDay >= 32,
      "must cover morning + afternoon at 15-minute steps",
    );
  });

  it("allows an explicit shorter days override", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60, days: 14 });
    assert.equal(w.days, 14);
    assert.equal(w.maxPerDay, 32);
    assert.equal(w.limit, 14 * 32);
  });

  it("caps the window at 90 days", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 120 });
    assert.equal(w.days, 90);
    assert.equal(w.limit, 960);
  });
});
