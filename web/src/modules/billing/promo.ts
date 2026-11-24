/** Apply a whole-number percent off an amount in pence. */
export function applyPercentOff(
  amountCents: number,
  percentOff: number | null | undefined,
): number {
  if (!amountCents || amountCents <= 0) return amountCents;
  if (!percentOff || percentOff <= 0) return amountCents;
  const pct = Math.min(100, Math.floor(percentOff));
  return Math.max(0, Math.round((amountCents * (100 - pct)) / 100));
}
