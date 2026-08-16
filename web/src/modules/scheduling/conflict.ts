/**
 * Pure interval helpers for diary conflict detection (unit-tested).
 * App-layer checks still apply buffers; these detect hard range overlap.
 */

export function intervalsOverlap(
  aStart: Date | number,
  aEnd: Date | number,
  bStart: Date | number,
  bEnd: Date | number,
): boolean {
  const as = typeof aStart === "number" ? aStart : aStart.getTime();
  const ae = typeof aEnd === "number" ? aEnd : aEnd.getTime();
  const bs = typeof bStart === "number" ? bStart : bStart.getTime();
  const be = typeof bEnd === "number" ? bEnd : bEnd.getTime();
  if (!(as < ae) || !(bs < be)) return false;
  return as < be && ae > bs;
}

/** Expand a slot by buffer minutes on each side (for soft conflict windows). */
export function withBuffers(
  startsAt: Date,
  endsAt: Date,
  bufferBeforeMin: number,
  bufferAfterMin: number,
) {
  return {
    windowStart: new Date(startsAt.getTime() - bufferBeforeMin * 60_000),
    windowEnd: new Date(endsAt.getTime() + bufferAfterMin * 60_000),
  };
}
