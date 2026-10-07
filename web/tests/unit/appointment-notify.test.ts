import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateAppointmentSchema } from "@/modules/scheduling/service";

describe("appointment notifyPatient schema", () => {
  it("accepts reschedule payload with notifyPatient false", () => {
    const parsed = updateAppointmentSchema.parse({
      startsAt: "2026-10-01T10:00:00.000Z",
      notifyPatient: false,
    });
    assert.equal(parsed.notifyPatient, false);
    assert.equal(parsed.startsAt, "2026-10-01T10:00:00.000Z");
  });

  it("accepts duration change with notifyPatient true", () => {
    const parsed = updateAppointmentSchema.parse({
      durationMinutes: 45,
      notifyPatient: true,
    });
    assert.equal(parsed.durationMinutes, 45);
    assert.equal(parsed.notifyPatient, true);
  });

  it("allows notifyPatient to be omitted", () => {
    const parsed = updateAppointmentSchema.parse({
      startsAt: "2026-10-01T11:00:00.000Z",
    });
    assert.equal(parsed.notifyPatient, undefined);
  });
});
