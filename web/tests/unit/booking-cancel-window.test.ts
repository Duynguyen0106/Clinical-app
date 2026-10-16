import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWithinCancelWindow,
  type BookingPolicy,
} from "../../src/modules/scheduling/policy";
import { DepositMode } from "../../src/generated/prisma/client";

const policy24: BookingPolicy = {
  bookingMinNoticeHours: 2,
  bookingMaxAdvanceDays: 60,
  cancelMinNoticeHours: 24,
  depositMode: DepositMode.OFF,
  depositDefaultCents: 2000,
  bookingPolicyText: "Please give at least 24 hours’ notice.",
};

describe("assertWithinCancelWindow", () => {
  it("allows cancel/reschedule when more than 24 hours remain", () => {
    const now = new Date("2026-10-10T10:00:00.000Z");
    const startsAt = new Date("2026-10-11T12:00:00.000Z"); // 26h later
    assert.doesNotThrow(() =>
      assertWithinCancelWindow(policy24, startsAt, now),
    );
  });

  it("blocks cancel/reschedule inside the 24-hour window", () => {
    const now = new Date("2026-10-10T10:00:00.000Z");
    const startsAt = new Date("2026-10-11T08:00:00.000Z"); // 22h later
    assert.throws(
      () => assertWithinCancelWindow(policy24, startsAt, now),
      (err: Error & { status?: number }) => {
        assert.match(err.message, /at least 24 hours/);
        return true;
      },
    );
  });
});
