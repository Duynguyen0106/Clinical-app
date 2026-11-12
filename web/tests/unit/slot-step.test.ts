import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLOT_STEP_MINUTES } from "../../src/modules/scheduling/slots";

describe("SLOT_STEP_MINUTES", () => {
  it("uses a 15-minute bookable grid", () => {
    assert.equal(SLOT_STEP_MINUTES, 15);
    // 13:00, 13:15, 13:30, 13:45 within one clock hour
    assert.equal(60 / SLOT_STEP_MINUTES, 4);
  });
});
