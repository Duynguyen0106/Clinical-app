import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clinicDateKey,
  clinicDayOfWeek,
  clinicLocalDateTime,
  clinicMinutesFromMidnight,
} from "../../src/modules/scheduling/clinic-time";
import { isWindowAvailable } from "../../src/modules/scheduling/availability";

const TZ = "Europe/London";

/** Austin-style hours: Mon/Tue/Thu/Fri 09:00–18:00, Sat 09:00–17:30 */
const RULES = [
  { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 5, startMinute: 9 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 17 * 60 + 30 },
];

describe("clinic-time helpers (Europe/London BST)", () => {
  it("maps 09:00 London in October to 08:00 UTC", () => {
    const utc = clinicLocalDateTime("2026-10-20", 9 * 60, TZ);
    assert.equal(utc.toISOString(), "2026-10-20T08:00:00.000Z");
  });

  it("reads clinic-local minutes from a UTC instant", () => {
    const londonNine = new Date("2026-10-20T08:00:00.000Z");
    assert.equal(clinicMinutesFromMidnight(londonNine, TZ), 9 * 60);
    assert.equal(clinicDateKey(londonNine, TZ), "2026-10-20");
    assert.equal(clinicDayOfWeek(londonNine, TZ), 2); // Tuesday
  });
});

describe("isWindowAvailable clinic timezone", () => {
  it("allows Tuesday 09:00 London (08:00Z) inside 09:00–18:00 rules", () => {
    const startsAt = new Date("2026-10-20T08:00:00.000Z");
    const startMinute = clinicMinutesFromMidnight(startsAt, TZ);
    const endMinute = startMinute + 30;
    assert.equal(
      isWindowAvailable({
        day: startsAt,
        startMinute,
        endMinute,
        rules: RULES,
        exceptions: [],
        timeZone: TZ,
      }),
      true,
    );
  });

  it("rejects Tuesday 08:00 London (07:00Z) before hours start", () => {
    const startsAt = new Date("2026-10-20T07:00:00.000Z");
    const startMinute = clinicMinutesFromMidnight(startsAt, TZ);
    assert.equal(
      isWindowAvailable({
        day: startsAt,
        startMinute,
        endMinute: startMinute + 30,
        rules: RULES,
        exceptions: [],
        timeZone: TZ,
      }),
      false,
    );
  });

  it("rejects Wednesday when no Wednesday rule exists", () => {
    const startsAt = new Date("2026-10-21T08:00:00.000Z"); // Wed 09:00 London
    const startMinute = clinicMinutesFromMidnight(startsAt, TZ);
    assert.equal(clinicDayOfWeek(startsAt, TZ), 3);
    assert.equal(
      isWindowAvailable({
        day: startsAt,
        startMinute,
        endMinute: startMinute + 30,
        rules: RULES,
        exceptions: [],
        timeZone: TZ,
      }),
      false,
    );
  });
});
