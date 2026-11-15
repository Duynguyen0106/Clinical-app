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

  it("patient manage 21-day window exceeds the old 48-slot default", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 60, days: 21 });
    assert.equal(w.days, 21);
    assert.ok(
      w.limit > 48,
      "must not truncate reschedule options to ~2 clinic days",
    );
    assert.equal(w.limit, 21 * 32);
  });

  it("caps the window at 90 days", () => {
    const w = publicSlotWindow({ maxAdvanceDays: 120 });
    assert.equal(w.days, 90);
    assert.equal(w.limit, 960);
  });
});
