import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
} from "@/modules/scheduling/appointment-types";

describe("appointment type schemas", () => {
  it("accepts a clinic service with length and GBP price in pence", () => {
    const parsed = createAppointmentTypeSchema.parse({
      name: "Physio · Follow-up",
      durationMinutes: 30,
      defaultPriceCents: 5500,
      onlineBookable: true,
    });
    assert.equal(parsed.name, "Physio · Follow-up");
    assert.equal(parsed.durationMinutes, 30);
    assert.equal(parsed.defaultPriceCents, 5500);
  });

  it("rejects durations that are too short", () => {
    assert.throws(() =>
      createAppointmentTypeSchema.parse({
        name: "Quick",
        durationMinutes: 2,
        defaultPriceCents: 1000,
      }),
    );
  });

  it("allows partial updates including deactivate", () => {
    const parsed = updateAppointmentTypeSchema.parse({
      active: false,
      durationMinutes: 45,
      defaultPriceCents: 8000,
    });
    assert.equal(parsed.active, false);
    assert.equal(parsed.durationMinutes, 45);
    assert.equal(parsed.defaultPriceCents, 8000);
  });
});
