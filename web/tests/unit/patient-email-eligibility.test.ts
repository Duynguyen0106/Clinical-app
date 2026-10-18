import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNoShowFollowUpDue,
  isReviewDue,
  isThankYouDue,
  shouldSendSameDayReminder,
  THANK_YOU_LOOKBACK_MS,
} from "@/modules/notifications/patient-email-eligibility";

describe("patient email eligibility", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");

  it("thank-you is due after delay within lookback", () => {
    const endsAt = new Date("2026-10-17T12:00:00.000Z"); // 24h ago
    assert.equal(
      isThankYouDue({ now, endsAt, delayHours: 18 }),
      true,
    );
  });

  it("thank-you is not due before delay", () => {
    const endsAt = new Date("2026-10-18T10:00:00.000Z"); // 2h ago
    assert.equal(
      isThankYouDue({ now, endsAt, delayHours: 18 }),
      false,
    );
  });

  it("thank-you skips history outside lookback", () => {
    const endsAt = new Date(now.getTime() - THANK_YOU_LOOKBACK_MS - 60_000);
    assert.equal(
      isThankYouDue({ now, endsAt, delayHours: 18 }),
      false,
    );
  });

  it("review is time-based and needs URL + marketing consent", () => {
    const endsAt = new Date("2026-10-15T12:00:00.000Z"); // 3 days ago
    assert.equal(
      isReviewDue({
        now,
        endsAt,
        delayDays: 2,
        hasReviewUrl: true,
        hasMarketingConsent: true,
      }),
      true,
    );
    assert.equal(
      isReviewDue({
        now,
        endsAt,
        delayDays: 2,
        hasReviewUrl: true,
        hasMarketingConsent: false,
      }),
      false,
    );
    assert.equal(
      isReviewDue({
        now,
        endsAt,
        delayDays: 2,
        hasReviewUrl: false,
        hasMarketingConsent: true,
      }),
      false,
    );
  });

  it("no-show follow-up respects delay and lookback", () => {
    const startsAt = new Date("2026-10-17T12:00:00.000Z");
    assert.equal(
      isNoShowFollowUpDue({ now, startsAt, delayHours: 24 }),
      true,
    );
    assert.equal(
      isNoShowFollowUpDue({
        now,
        startsAt: new Date("2026-09-01T12:00:00.000Z"),
        delayHours: 24,
      }),
      false,
    );
  });

  it("same-day reminder requires clinic today + contact + cooldown", () => {
    const startsAt = new Date("2026-10-18T14:00:00.000Z");
    assert.equal(
      shouldSendSameDayReminder({
        now,
        startsAt,
        sameDayHours: 4,
        clinicDateKeyToday: "2026-10-18",
        appointmentDateKey: "2026-10-18",
        reminderSentAt: null,
        hasContact: true,
      }),
      true,
    );
    assert.equal(
      shouldSendSameDayReminder({
        now,
        startsAt,
        sameDayHours: 4,
        clinicDateKeyToday: "2026-10-18",
        appointmentDateKey: "2026-10-19",
        reminderSentAt: null,
        hasContact: true,
      }),
      false,
    );
    assert.equal(
      shouldSendSameDayReminder({
        now,
        startsAt,
        sameDayHours: 4,
        clinicDateKeyToday: "2026-10-18",
        appointmentDateKey: "2026-10-18",
        reminderSentAt: new Date("2026-10-18T11:00:00.000Z"),
        hasContact: true,
      }),
      false,
    );
  });
});
