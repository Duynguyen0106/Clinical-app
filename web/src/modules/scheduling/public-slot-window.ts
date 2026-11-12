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
  // ~8h open × 4 starts/hour ≈ 32; covers 09:00–17:00 at 15‑minute steps.
  const maxPerDay = 32;
  const limit = Math.min(Math.max(days * maxPerDay, 64), 960);
  return { days, limit, maxPerDay };
}
