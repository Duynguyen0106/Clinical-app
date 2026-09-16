import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appointmentOccupiesSlot,
  calendarEventStatusClass,
  humanStatusLabel,
} from "../../src/modules/scheduling/calendar-ui";

describe("appointmentOccupiesSlot", () => {
  it("treats booked and completed as occupying", () => {
    assert.equal(appointmentOccupiesSlot("BOOKED"), true);
    assert.equal(appointmentOccupiesSlot("COMPLETED"), true);
    assert.equal(appointmentOccupiesSlot("CONFIRMED"), true);
  });

  it("frees cancelled and no-show slots", () => {
    assert.equal(appointmentOccupiesSlot("CANCELLED"), false);
    assert.equal(appointmentOccupiesSlot("NO_SHOW"), false);
  });
});

describe("calendarEventStatusClass", () => {
  it("maps booked, no-show, and completed to distinct classes", () => {
    assert.equal(calendarEventStatusClass("BOOKED"), "status-booked");
    assert.equal(calendarEventStatusClass("NO_SHOW"), "status-no_show");
    assert.equal(calendarEventStatusClass("COMPLETED"), "status-completed");
  });
});

describe("humanStatusLabel", () => {
  it("formats status for display", () => {
    assert.equal(humanStatusLabel("NO_SHOW"), "No-show");
    assert.equal(humanStatusLabel("COMPLETED"), "Completed");
    assert.equal(humanStatusLabel("BOOKED"), "Booked");
  });
});
