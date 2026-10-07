import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayBoundsFromYmd,
  parseListQuery,
  todayYmd,
} from "../../src/modules/patients/service";

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

describe("dayBoundsFromYmd", () => {
  it("builds inclusive local day window", () => {
    const { from, to } = dayBoundsFromYmd("2026-09-16");
    assert.equal(from.getFullYear(), 2026);
    assert.equal(from.getMonth(), 8);
    assert.equal(from.getDate(), 16);
    assert.equal(from.getHours(), 0);
    assert.equal(to.getHours(), 23);
    assert.ok(to.getTime() > from.getTime());
  });

  it("rejects garbage dates", () => {
    assert.throws(() => dayBoundsFromYmd("not-a-date"), /Invalid appointmentOn/);
  });
});

describe("todayYmd", () => {
  it("formats YYYY-MM-DD", () => {
    assert.equal(todayYmd(new Date(2026, 8, 16, 15, 30)), "2026-09-16");
  });
});
