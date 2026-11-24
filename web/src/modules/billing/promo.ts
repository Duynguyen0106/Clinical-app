/** Hard ceiling for any sealed / stored appointment promo percent. */
export const MAX_PROMO_PERCENT_OFF = 15;

export function clampPromoPercentOff(
  percentOff: number | null | undefined,
): number | null {
  if (!percentOff || percentOff <= 0) return null;
  const pct = Math.floor(percentOff);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.min(MAX_PROMO_PERCENT_OFF, pct);
}

/** Apply a whole-number percent off an amount in pence (capped). */
export function applyPercentOff(
  amountCents: number,
  percentOff: number | null | undefined,
): number {
  if (!amountCents || amountCents <= 0) return amountCents;
  const pct = clampPromoPercentOff(percentOff);
  if (!pct) return amountCents;
  return Math.max(0, Math.round((amountCents * (100 - pct)) / 100));
}
