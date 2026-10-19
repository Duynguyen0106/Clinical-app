/**
 * Pass post-booking fields via sessionStorage so they never land in the
 * confirmation page query string (Referer, history, analytics).
 *
 * Manage capability is intentionally NOT stored here — patients use the
 * link from their confirmation email.
 */

export type BookingHandoff = {
  depositStatus?: string;
  depositCents?: number;
  policyText?: string;
  bankTransfer?: {
    accountName: string;
    sortCode: string;
    accountNumber: string;
    amountPounds: string;
    reference: string;
    currency: "GBP";
  };
};

function key(slug: string) {
  return `treow.book.handoff.${slug}`;
}

export function stashBookingHandoff(slug: string, data: BookingHandoff) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key(slug), JSON.stringify(data));
  } catch {
    /* private mode / quota */
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
