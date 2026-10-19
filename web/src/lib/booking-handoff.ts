/**
 * Pass sensitive post-booking fields (manage URL, deposit status) via
 * sessionStorage so they never land in the confirmation page query string
 * (Referer, history, analytics).
 */

export type BookingHandoff = {
  manageHref?: string;
  depositStatus?: string;
  depositCents?: number;
  policyText?: string;
};

function key(slug: string) {
  return `treow.book.handoff.${slug}`;
}

export function stashBookingHandoff(slug: string, data: BookingHandoff) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key(slug), JSON.stringify(data));
  } catch {
    /* private mode / quota — confirmed page can still show non-manage UI */
  }
}

export function readBookingHandoff(slug: string): BookingHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingHandoff;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
