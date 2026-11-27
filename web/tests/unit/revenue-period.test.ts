import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRevenuePeriod,
  revenueQuerySchema,
} from "@/modules/billing/revenue";

const TZ = "Europe/London";

describe("revenueQuerySchema", () => {
  it("defaults preset to day", () => {
    const q = revenueQuerySchema.parse({});
    assert.equal(q.preset, "day");
  });

  it("accepts custom from/to", () => {
    const q = revenueQuerySchema.parse({
      preset: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    assert.equal(q.preset, "custom");
    assert.equal(q.from, "2026-01-01");
  });
});

describe("resolveRevenuePeriod", () => {
  it("resolves a single clinic day as half-open UTC range", () => {
    const p = resolveRevenuePeriod(
      { preset: "day", date: "2026-06-15" },
      TZ,
    );
    assert.equal(p.fromKey, "2026-06-15");
    assert.equal(p.toKey, "2026-06-15");
    assert.equal(p.label, "15 June 2026");
    assert.ok(p.to.getTime() > p.from.getTime());
    // BST: local midnight is 23:00 previous day UTC
    assert.equal(p.from.toISOString(), "2026-06-14T23:00:00.000Z");
    assert.equal(p.to.toISOString(), "2026-06-15T23:00:00.000Z");
  });

  it("resolves a calendar month", () => {
    const p = resolveRevenuePeriod(
      { preset: "month", month: "2026-02" },
      TZ,
    );
    assert.equal(p.fromKey, "2026-02-01");
    assert.equal(p.toKey, "2026-02-28");
    assert.equal(p.label, "February 2026");
    // February is GMT: local midnight == UTC midnight
    assert.equal(p.from.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(p.to.toISOString(), "2026-03-01T00:00:00.000Z");
  });

  it("resolves a calendar year", () => {
    const p = resolveRevenuePeriod({ preset: "year", year: "2025" }, TZ);
    assert.equal(p.fromKey, "2025-01-01");
    assert.equal(p.toKey, "2025-12-31");
    assert.equal(p.label, "2025");
  });

  it("rejects inverted custom ranges", () => {
    assert.throws(
      () =>
        resolveRevenuePeriod(
          { preset: "custom", from: "2026-02-01", to: "2026-01-01" },
          TZ,
        ),
      /from must be on or before to/,
    );
  });

  it("rejects custom spans over 366 days", () => {
    assert.throws(
      () =>
        resolveRevenuePeriod(
          { preset: "custom", from: "2025-01-01", to: "2026-12-31" },
          TZ,
        ),
      /cannot exceed 366/,
    );
  });

  it("accepts a 31-day custom range", () => {
    const p = resolveRevenuePeriod(
      { preset: "custom", from: "2026-01-01", to: "2026-01-31" },
      TZ,
    );
    assert.equal(p.fromKey, "2026-01-01");
    assert.equal(p.toKey, "2026-01-31");
    assert.match(p.label, /1 Jan 2026/);
  });
});
