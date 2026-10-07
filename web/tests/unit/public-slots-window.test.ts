import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicSlotWindow } from "../../src/modules/scheduling/public-slot-window";

describe("publicSlotWindow", () => {
  it("uses clinic max advance days and a limit large enough for the window", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60 });
    assert.equal(w.days, 60);
    assert.equal(w.limit, 2500);
    assert.ok(w.limit > 48, "must exceed the old default that hid later days");
  });

  it("allows an explicit shorter days override", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60, days: 14 });
    assert.equal(w.days, 14);
    assert.equal(w.limit, 14 * 48);
  });

  it("caps the window at 90 days", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 120 });
    assert.equal(w.days, 90);
    assert.equal(w.limit, 2500);
  });
});
