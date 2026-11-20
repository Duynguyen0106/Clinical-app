/**
 * Public booking day picker needs the clinic advance window so later days
 * appear as chips — but we must not emit every 15‑minute ISO for 90 days
 * without a bound.
 *
 * Strategy: keep the day span; allow a full clinic day of 15‑minute starts
 * (morning + afternoon); hard-cap total payload size.
 */
export function publicSlotWindow(args: {
  maxAdvanceDays: number;
  days?: number;
}) {
  const days = Math.min(Math.max(args.days ?? args.maxAdvanceDays, 1), 90);
  // ~11h open × 4 starts/hour ≈ 44; covers 09:00–20:00 at 15‑minute steps
  // (30‑min services → last start 19:30). Cap slightly above that.
  const maxPerDay = 48;
  const limit = Math.min(Math.max(days * maxPerDay, 64), 1440);
  return { days, limit, maxPerDay };
}
