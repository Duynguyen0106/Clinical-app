import { createHmac, timingSafeEqual } from "node:crypto";
import { getAppBaseUrl } from "@/server/env";
import { forbidden } from "@/server/errors";

function offerSecret() {
  return process.env.AUTH_SECRET ?? "treow-dev-secret-change-me";
}

/** HMAC token bound to waitlist entry + expiry (ms). */
export function createWaitlistOfferToken(
  entryId: string,
  expiresAtMs: number,
) {
  const exp = String(expiresAtMs);
  const payload = `wl.${entryId}.${exp}`;
  const sig = createHmac("sha256", offerSecret())
    .update(payload)
    .digest("base64url");
  return `${entryId}.${exp}.${sig}`;
}

export function verifyWaitlistOfferToken(token: string): {
  entryId: string;
  expiresAtMs: number;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw forbidden("Invalid waitlist offer link");
  const [entryId, exp, sig] = parts;
  if (!entryId || !exp || !sig) throw forbidden("Invalid waitlist offer link");
  const expiresAtMs = Number(exp);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    throw forbidden("This waitlist offer link has expired");
  }

  const payload = `wl.${entryId}.${exp}`;
  const expected = createHmac("sha256", offerSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw forbidden("Invalid waitlist offer link");
  }
  return { entryId, expiresAtMs };
}

export function waitlistOfferUrl(entryId: string, expiresAt: Date) {
  const token = createWaitlistOfferToken(entryId, expiresAt.getTime());
  return `${getAppBaseUrl()}/book/waitlist/${encodeURIComponent(token)}`;
}
