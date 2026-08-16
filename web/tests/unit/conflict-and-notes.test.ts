import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  intervalsOverlap,
  withBuffers,
} from "../../src/modules/scheduling/conflict";
import { hashNoteContent } from "../../src/modules/notes/hash";

describe("intervalsOverlap", () => {
  it("detects overlapping ranges", () => {
    const a0 = new Date("2026-08-16T10:00:00Z");
    const a1 = new Date("2026-08-16T10:30:00Z");
    const b0 = new Date("2026-08-16T10:15:00Z");
    const b1 = new Date("2026-08-16T10:45:00Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), true);
  });

  it("allows adjacent ranges that only touch at an endpoint", () => {
    const a0 = new Date("2026-08-16T10:00:00Z");
    const a1 = new Date("2026-08-16T10:30:00Z");
    const b0 = new Date("2026-08-16T10:30:00Z");
    const b1 = new Date("2026-08-16T11:00:00Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), false);
  });

  it("rejects inverted intervals", () => {
    assert.equal(
      intervalsOverlap(
        new Date("2026-08-16T11:00:00Z"),
        new Date("2026-08-16T10:00:00Z"),
        new Date("2026-08-16T10:00:00Z"),
        new Date("2026-08-16T12:00:00Z"),
      ),
      false,
    );
  });
});

describe("withBuffers", () => {
  it("expands the window by buffer minutes", () => {
    const starts = new Date("2026-08-16T10:00:00Z");
    const ends = new Date("2026-08-16T10:30:00Z");
    const { windowStart, windowEnd } = withBuffers(starts, ends, 5, 10);
    assert.equal(windowStart.toISOString(), "2026-08-16T09:55:00.000Z");
    assert.equal(windowEnd.toISOString(), "2026-08-16T10:40:00.000Z");
  });
});

describe("hashNoteContent", () => {
  it("is stable for the same content", () => {
    const a = hashNoteContent({ subjective: "ok", plan: "review" });
    const b = hashNoteContent({ subjective: "ok", plan: "review" });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it("changes when content changes", () => {
    const a = hashNoteContent({ subjective: "ok" });
    const b = hashNoteContent({ subjective: "changed" });
    assert.notEqual(a, b);
  });
});
