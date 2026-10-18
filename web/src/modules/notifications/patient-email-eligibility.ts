/** Pure eligibility helpers for patient email automation (unit-testable). */

export const THANK_YOU_LOOKBACK_MS = 14 * 24 * 60 * 60_000;
export const REVIEW_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
export const NO_SHOW_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
/** Skip same-day nudge if a longer-horizon reminder was sent this recently. */
export const SAME_DAY_REMINDER_COOLDOWN_MS = 6 * 60 * 60_000;

export function lookbackWindow(now: Date, lookbackMs: number) {
  return {
    gte: new Date(now.getTime() - lookbackMs),
    lte: now,
  };
}

/** Due when endsAt is at least delayHours in the past, within lookback. */
export function isThankYouDue(opts: {
  now: Date;
  endsAt: Date;
  delayHours: number;
  lookbackMs?: number;
}) {
  const lookback = opts.lookbackMs ?? THANK_YOU_LOOKBACK_MS;
  const dueAt = opts.endsAt.getTime() + opts.delayHours * 60 * 60_000;
  const oldest = opts.now.getTime() - lookback;
  return (
    opts.endsAt.getTime() >= oldest &&
    dueAt <= opts.now.getTime() &&
    opts.endsAt.getTime() <= opts.now.getTime()
  );
}

/** Review is time-based only (not gated on thank-you delivery). */
export function isReviewDue(opts: {
  now: Date;
  endsAt: Date;
  delayDays: number;
  lookbackMs?: number;
  hasReviewUrl: boolean;
  hasMarketingConsent: boolean;
}) {
  if (!opts.hasReviewUrl || !opts.hasMarketingConsent) return false;
  const lookback = opts.lookbackMs ?? REVIEW_LOOKBACK_MS;
  const dueAt = opts.endsAt.getTime() + opts.delayDays * 24 * 60 * 60_000;
  const oldest = opts.now.getTime() - lookback;
  return opts.endsAt.getTime() >= oldest && dueAt <= opts.now.getTime();
}

export function isNoShowFollowUpDue(opts: {
  now: Date;
  startsAt: Date;
  delayHours: number;
  lookbackMs?: number;
}) {
  const lookback = opts.lookbackMs ?? NO_SHOW_LOOKBACK_MS;
  const dueAt = opts.startsAt.getTime() + opts.delayHours * 60 * 60_000;
  const oldest = opts.now.getTime() - lookback;
  return opts.startsAt.getTime() >= oldest && dueAt <= opts.now.getTime();
}

export function shouldSendSameDayReminder(opts: {
  now: Date;
  startsAt: Date;
  sameDayHours: number;
  clinicDateKeyToday: string;
  appointmentDateKey: string;
  reminderSentAt: Date | null;
  hasContact: boolean;
}) {
  if (!opts.hasContact) return false;
  if (opts.appointmentDateKey !== opts.clinicDateKeyToday) return false;
  if (opts.startsAt.getTime() < opts.now.getTime()) return false;
  if (
    opts.startsAt.getTime() >
    opts.now.getTime() + opts.sameDayHours * 60 * 60_000
  ) {
    return false;
  }
  if (
    opts.reminderSentAt &&
    opts.now.getTime() - opts.reminderSentAt.getTime() <
      SAME_DAY_REMINDER_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}
