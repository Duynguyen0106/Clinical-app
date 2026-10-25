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

/** Default TTL for consent links — two weeks. */
export const INTAKE_TOKEN_TTL_MS = 14 * 24 * 60 * 60_000;

function intakeSecret() {
  return getAuthSecret();
}

function sealKey() {
  return createHash("sha256").update(`intake-seal:${intakeSecret()}`).digest();
}

/**
 * Opaque intake token (v2): sealed submission id + expiry.
 * Mirrors manage-token sealing so the submission id is not in the URL cleartext.
 */
export function createIntakeToken(
  submissionId: string,
  expiresAt = Date.now() + INTAKE_TOKEN_TTL_MS,
) {
  const exp = String(expiresAt);
  const mac = createHmac("sha256", intakeSecret())
    .update(`${submissionId}.${exp}`)
    .digest();
  const plaintext = Buffer.concat([
    Buffer.from(submissionId, "utf8"),
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

export function verifyIntakeToken(token: string): { submissionId: string } {
  if (!token.startsWith("v2.")) {
    throw forbidden("This consent link is no longer valid. Ask the clinic for a new link.");
  }
  const sealed = token.slice(3);
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64url");
  } catch {
    throw forbidden("Invalid consent link");
  }
  if (buf.length < 12 + 16 + 1) throw forbidden("Invalid consent link");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw forbidden("Invalid consent link");
  }
  const null1 = plaintext.indexOf(0);
  const null2 = plaintext.indexOf(0, null1 + 1);
  if (null1 < 0 || null2 < 0) throw forbidden("Invalid consent link");
  const id = plaintext.subarray(0, null1).toString("utf8");
  const expStr = plaintext.subarray(null1 + 1, null2).toString("utf8");
  const mac = plaintext.subarray(null2 + 1);
  if (!id || !expStr || Number(expStr) < Date.now()) {
    throw forbidden("This consent link has expired");
  }
  const expected = createHmac("sha256", intakeSecret())
    .update(`${id}.${expStr}`)
    .digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw forbidden("Invalid consent link");
  }
  return { submissionId: id };
}

export function intakeUrlForToken(token: string) {
  return `${getAppBaseUrl()}/book/intake/${encodeURIComponent(token)}`;
}
