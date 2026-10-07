/** Public booking should span the clinic advance window, not stop after ~2 days. */
export function publicSlotWindow(args: {
  maxAdvanceDays: number;
  days?: number;
}) {
  const days = Math.min(
    Math.max(args.days ?? args.maxAdvanceDays, 1),
    90,
  );
  // 15‑minute steps ≈ up to ~40 slots/weekday; size the cap to the window.
  const limit = Math.min(Math.max(days * 48, 48), 2500);
  return { days, limit };
}
