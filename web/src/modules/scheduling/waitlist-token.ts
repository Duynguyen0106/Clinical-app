import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getAppBaseUrl, getAuthSecret } from "@/server/env";
import { forbidden } from "@/server/errors";

function offerSecret() {
  return getAuthSecret();
}

function sealKey() {
  return createHash("sha256").update(`waitlist-seal:${offerSecret()}`).digest();
}

/**
 * Opaque waitlist offer token (v2): sealed entry id + expiry.
 * Legacy `entryId.exp.sig` tokens exposed the id in the clear — rejected.
 */
export function createWaitlistOfferToken(
  entryId: string,
  expiresAtMs: number,
) {
  const exp = String(expiresAtMs);
  const mac = createHmac("sha256", offerSecret())
    .update(`wl.${entryId}.${exp}`)
    .digest();
  const plaintext = Buffer.concat([
    Buffer.from(entryId, "utf8"),
    Buffer.from("\0", "utf8"),
    Buffer.from(exp, "utf8"),
    Buffer.from("\0", "utf8"),
    mac,
  ]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `v2.${sealed}`;
}

export function verifyWaitlistOfferToken(token: string): {
  entryId: string;
  expiresAtMs: number;
} {
  if (token.startsWith("v2.")) {
    return verifySealedWaitlistToken(token.slice(3));
  }
  throw forbidden(
    "This waitlist offer link is no longer valid. Request a new offer from the clinic.",
  );
}

function verifySealedWaitlistToken(sealed: string): {
  entryId: string;
  expiresAtMs: number;
} {
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64url");
  } catch {
    throw forbidden("Invalid waitlist offer link");
  }
  if (buf.length < 12 + 16 + 1) throw forbidden("Invalid waitlist offer link");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw forbidden("Invalid waitlist offer link");
  }
  const null1 = plaintext.indexOf(0);
  const null2 = plaintext.indexOf(0, null1 + 1);
  if (null1 < 0 || null2 < 0) throw forbidden("Invalid waitlist offer link");
  const entryId = plaintext.subarray(0, null1).toString("utf8");
  const expStr = plaintext.subarray(null1 + 1, null2).toString("utf8");
  const mac = plaintext.subarray(null2 + 1);
  const expiresAtMs = Number(expStr);
  if (!entryId || !Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    throw forbidden("This waitlist offer link has expired");
  }
  const expected = createHmac("sha256", offerSecret())
    .update(`wl.${entryId}.${expStr}`)
    .digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw forbidden("Invalid waitlist offer link");
  }
  return { entryId, expiresAtMs };
}

export function waitlistOfferUrl(entryId: string, expiresAt: Date) {
  const token = createWaitlistOfferToken(entryId, expiresAt.getTime());
  return `${getAppBaseUrl()}/book/waitlist/${encodeURIComponent(token)}`;
}
