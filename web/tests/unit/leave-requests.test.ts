import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLeaveRequestSchema } from "@/modules/scheduling/leave";

describe("leave request schema", () => {
  it("accepts a date-range annual leave request", () => {
    const parsed = createLeaveRequestSchema.parse({
      practitionerId: "prac_1",
      startDate: "2026-10-01",
      endDate: "2026-10-10",
      reason: "Annual leave",
      allDay: true,
    });
    assert.equal(parsed.reason, "Annual leave");
    assert.equal(parsed.startDate, "2026-10-01");
    assert.equal(parsed.endDate, "2026-10-10");
  });

  it("rejects invalid dates", () => {
    assert.throws(() =>
      createLeaveRequestSchema.parse({
        practitionerId: "prac_1",
        startDate: "01-10-2026",
        endDate: "2026-10-10",
        reason: "Sick leave",
      }),
    );
  });
});
