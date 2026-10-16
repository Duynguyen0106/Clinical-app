import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayBoundsFromYmd,
  parseListQuery,
  todayYmd,
} from "../../src/modules/patients/service";

const TZ = "Europe/London";

describe("parseListQuery appointment day filters", () => {
  it("parses appointmentOn and practitionerId", () => {
    const parsed = parseListQuery(
      new URL(
        "https://example.test/patients?appointmentOn=2026-09-16&practitionerId=prac_1&q=Sam&take=10",
      ),
    );
    assert.equal(parsed.appointmentOn, "2026-09-16");
    assert.equal(parsed.practitionerId, "prac_1");
    assert.equal(parsed.q, "Sam");
    assert.equal(parsed.take, 10);
  });

  it("rejects invalid appointmentOn", () => {
    assert.throws(
      () =>
        parseListQuery(
          new URL("https://example.test/patients?appointmentOn=16-09-2026"),
        ),
      /appointmentOn must be YYYY-MM-DD/,
    );
  });

  it("allows directory listing without day filter", () => {
    const parsed = parseListQuery(new URL("https://example.test/patients?q=a"));
    assert.equal(parsed.appointmentOn, undefined);
    assert.equal(parsed.practitionerId, undefined);
  });
});

describe("dayBoundsFromYmd clinic timezone", () => {
  it("maps London civil day to UTC bounds (BST)", () => {
    const { from, to } = dayBoundsFromYmd("2026-09-16", TZ);
    // 00:00 London BST = 23:00 previous day UTC
    assert.equal(from.toISOString(), "2026-09-15T23:00:00.000Z");
    assert.ok(to.getTime() > from.getTime());
    // End of London day should still be before next London midnight (22:00Z on 16th)
    assert.ok(to.getTime() < new Date("2026-09-16T23:00:00.000Z").getTime());
  });

  it("rejects garbage dates", () => {
    assert.throws(
      () => dayBoundsFromYmd("not-a-date", TZ),
      /Invalid appointmentOn/,
    );
  });
});

describe("todayYmd", () => {
  it("formats YYYY-MM-DD in clinic timezone", () => {
    // 2026-09-16 01:30 UTC = still 16th in London (BST)
    assert.equal(todayYmd(TZ, new Date("2026-09-16T01:30:00.000Z")), "2026-09-16");
    // 2026-09-16 23:30 UTC = 17th in London
    assert.equal(todayYmd(TZ, new Date("2026-09-16T23:30:00.000Z")), "2026-09-17");
  });
});
