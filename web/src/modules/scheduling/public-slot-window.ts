/**
 * Public booking day picker needs the clinic advance window so later days
 * appear as chips — but we must not emit every 15‑minute ISO for 60 days.
 *
 * Strategy: keep the day span, cap slots per day + total payload size.
 */
export function publicSlotWindow(args: {
  maxAdvanceDays: number;
  days?: number;
}) {
  const days = Math.min(Math.max(args.days ?? args.maxAdvanceDays, 1), 90);
  // ~8 open times/day is enough for chips + morning/afternoon UI; hard cap payload.
  const maxPerDay = 8;
  const limit = Math.min(Math.max(days * maxPerDay, 48), 480);
  return { days, limit, maxPerDay };
}
