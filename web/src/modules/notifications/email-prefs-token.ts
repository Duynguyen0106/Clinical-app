/**
 * Opaque email-preference tokens for thank-you / review unsubscribe links.
 * Sealed like manage/intake tokens so patient + clinic ids are not URL cleartext.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { forbidden } from "@/server/errors";
import { getAppBaseUrl, getAuthSecret } from "@/server/env";

/** Prefer long-lived links so patients can opt out months after a visit. */
export const EMAIL_PREFS_TOKEN_TTL_MS = 365 * 24 * 60 * 60_000;

function prefsSecret() {
  return getAuthSecret();
}

function sealKey() {
  return createHash("sha256").update(`email-prefs-seal:${prefsSecret()}`).digest();
}

export function createEmailPrefsToken(
  patientId: string,
  clinicId: string,
  expiresAt = Date.now() + EMAIL_PREFS_TOKEN_TTL_MS,
) {
  const exp = String(expiresAt);
  const payload = `${patientId}.${clinicId}.${exp}`;
  const mac = createHmac("sha256", prefsSecret()).update(payload).digest();
  const plaintext = Buffer.concat([
    Buffer.from(patientId, "utf8"),
    Buffer.from("\0", "utf8"),
    Buffer.from(clinicId, "utf8"),
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

export function verifyEmailPrefsToken(token: string): {
  patientId: string;
  clinicId: string;
} {
  if (!token.startsWith("v2.")) {
    throw forbidden("This preference link is no longer valid.");
  }
  const sealed = token.slice(3);
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64url");
  } catch {
    throw forbidden("Invalid preference link");
  }
  if (buf.length < 12 + 16 + 1) throw forbidden("Invalid preference link");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw forbidden("Invalid preference link");
  }
  const null1 = plaintext.indexOf(0);
  const null2 = plaintext.indexOf(0, null1 + 1);
  const null3 = plaintext.indexOf(0, null2 + 1);
  if (null1 < 0 || null2 < 0 || null3 < 0) {
    throw forbidden("Invalid preference link");
  }
  const patientId = plaintext.subarray(0, null1).toString("utf8");
  const clinicId = plaintext.subarray(null1 + 1, null2).toString("utf8");
  const expStr = plaintext.subarray(null2 + 1, null3).toString("utf8");
  const mac = plaintext.subarray(null3 + 1);
  if (!patientId || !clinicId || !expStr || Number(expStr) < Date.now()) {
    throw forbidden("This preference link has expired");
  }
  const expected = createHmac("sha256", prefsSecret())
    .update(`${patientId}.${clinicId}.${expStr}`)
    .digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw forbidden("Invalid preference link");
  }
  return { patientId, clinicId };
}

export function emailPrefsUrlForToken(token: string) {
  return `${getAppBaseUrl()}/book/email-prefs/${encodeURIComponent(token)}`;
}
