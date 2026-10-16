import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appointmentOccupiesSlot,
  calendarEventStatusClass,
  diaryHoursFromRules,
  humanStatusLabel,
  isHourWithinRules,
  rulesForPractitioner,
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

/** Austin-style: Mon/Tue/Thu/Fri 09–18, Sat 09–17:30 — no Wednesday */
const AUSTIN_RULES = [
  { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 5, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 17 * 60 + 30 },
];

describe("open hours → calendar closed cells", () => {
  it("marks Tuesday 09:00 open and 08:00 closed", () => {
    assert.equal(isHourWithinRules(2, 9, AUSTIN_RULES), true);
    assert.equal(isHourWithinRules(2, 8, AUSTIN_RULES), false);
  });

  it("marks Wednesday fully closed when no rule exists", () => {
    for (const hour of [8, 9, 12, 17]) {
      assert.equal(isHourWithinRules(3, hour, AUSTIN_RULES), false);
    }
  });

  it("falls back to Mon–Fri 08–18 when no rules saved", () => {
    const rules = rulesForPractitioner([]);
    assert.equal(isHourWithinRules(1, 8, rules), true);
    assert.equal(isHourWithinRules(0, 10, rules), false); // Sunday
  });

  it("builds diary hour labels from open hours", () => {
    const hours = diaryHoursFromRules([AUSTIN_RULES]);
    assert.equal(hours[0], 8); // padded to include common early hour
    assert.ok(hours.includes(9));
    assert.ok(hours.includes(17));
    assert.equal(hours.includes(18), false);
  });
});
