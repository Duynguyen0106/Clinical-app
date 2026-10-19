import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus } from "@/generated/prisma/client";

/**
 * Document the invariant used by markDepositPaid:
 * only BOOKED appointments are promoted to CONFIRMED when a deposit clears.
 * CANCELLED / COMPLETED / NO_SHOW must keep their status (no resurrection).
 */
function shouldPromoteToConfirmed(status: AppointmentStatus) {
  return status === AppointmentStatus.BOOKED;
}

describe("deposit mark-paid status promotion", () => {
  it("promotes BOOKED to CONFIRMED", () => {
    assert.equal(shouldPromoteToConfirmed(AppointmentStatus.BOOKED), true);
  });

  it("does not resurrect terminal statuses", () => {
    for (const status of [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ]) {
      assert.equal(shouldPromoteToConfirmed(status), false);
    }
  });

  it("leaves in-progress / checked-in / already-confirmed alone", () => {
    for (const status of [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
    ]) {
      assert.equal(shouldPromoteToConfirmed(status), false);
    }
  });
});
