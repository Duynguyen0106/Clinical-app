import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { prisma } from "@/server/db";
import { forbidden, notFound } from "@/server/errors";
import { getAppBaseUrl, getAuthSecret } from "@/server/env";
import {
  MAX_PROMO_PERCENT_OFF,
  clampPromoPercentOff,
} from "@/modules/billing/promo";

/** Returning-patient rebook links stay valid for a month. */
const REBOOK_TTL_MS = 30 * 24 * 60 * 60_000;
/** Win-back promo links stay valid long enough after a 90-day nudge. */
const WINBACK_TTL_MS = 45 * 24 * 60 * 60_000;

/** Fixed win-back offer — applied when booking via sealed promo rebook link. */
export const WINBACK_PERCENT_OFF = MAX_PROMO_PERCENT_OFF;
export { MAX_PROMO_PERCENT_OFF, clampPromoPercentOff };

function rebookSecret() {
  return getAuthSecret();
}

function sealKey() {
  return createHash("sha256").update(`rebook-seal:${rebookSecret()}`).digest();
}

export type RebookPayload = {
  clinicId: string;
  patientId: string;
  practitionerId?: string | null;
  /** When set (e.g. 15), next appointment invoice uses this percent off. */
  percentOff?: number | null;
};

/**
 * Opaque rebook token.
 * - `rb2.` — clinic + patient + prac + percentOff + exp (promo-capable)
 * - `rb1.` — legacy without percentOff (still accepted)
 */
export function createRebookToken(
  payload: RebookPayload,
  expiresAt = Date.now() + REBOOK_TTL_MS,
) {
  const exp = String(expiresAt);
  const prac = payload.practitionerId?.trim() || "";
  const clamped = clampPromoPercentOff(payload.percentOff);
  const pct = clamped ? String(clamped) : "";
  const body = `${payload.clinicId}\0${payload.patientId}\0${prac}\0${pct}\0${exp}`;
  const mac = createHmac("sha256", rebookSecret()).update(body).digest();
  const plaintext = Buffer.concat([
    Buffer.from(body, "utf8"),
    Buffer.from("\0"),
    mac,
  ]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `rb2.${sealed}`;
}

export function verifyRebookToken(
  token: string,
): RebookPayload & { exp: number } {
  if (token.startsWith("rb2.")) {
    return verifySealedRebookToken(token.slice(4), true);
  }
  if (token.startsWith("rb1.")) {
    return verifySealedRebookToken(token.slice(4), false);
  }
  throw forbidden("This rebook link is no longer valid");
}

function verifySealedRebookToken(
  sealed: string,
  withPercent: boolean,
): RebookPayload & { exp: number } {
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64url");
  } catch {
    throw forbidden("Invalid rebook link");
  }
  if (buf.length < 12 + 16 + 1) throw forbidden("Invalid rebook link");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw forbidden("Invalid rebook link");
  }

  if (withPercent) {
    // clinic\0patient\0prac\0pct\0exp\0 + mac
    const null1 = plaintext.indexOf(0);
    const null2 = plaintext.indexOf(0, null1 + 1);
    const null3 = plaintext.indexOf(0, null2 + 1);
    const null4 = plaintext.indexOf(0, null3 + 1);
    const null5 = plaintext.indexOf(0, null4 + 1);
    if (
      null1 < 0 ||
      null2 < 0 ||
      null3 < 0 ||
      null4 < 0 ||
      null5 < 0
    ) {
      throw forbidden("Invalid rebook link");
    }
    const clinicId = plaintext.subarray(0, null1).toString("utf8");
    const patientId = plaintext.subarray(null1 + 1, null2).toString("utf8");
    const prac = plaintext.subarray(null2 + 1, null3).toString("utf8");
    const pctStr = plaintext.subarray(null3 + 1, null4).toString("utf8");
    const expStr = plaintext.subarray(null4 + 1, null5).toString("utf8");
    const mac = plaintext.subarray(null5 + 1);
    if (!clinicId || !patientId || !expStr) {
      throw forbidden("Invalid rebook link");
    }
    if (Number(expStr) < Date.now()) {
      throw forbidden("This rebook link has expired");
    }
    const body = `${clinicId}\0${patientId}\0${prac}\0${pctStr}\0${expStr}`;
    const expected = createHmac("sha256", rebookSecret()).update(body).digest();
    if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
      throw forbidden("Invalid rebook link");
    }
    const percentOff = pctStr ? Number(pctStr) : null;
    return {
      clinicId,
      patientId,
      practitionerId: prac || null,
      percentOff: clampPromoPercentOff(percentOff),
      exp: Number(expStr),
    };
  }

  // Legacy rb1: clinic\0patient\0prac\0exp\0 + mac
  const null1 = plaintext.indexOf(0);
  const null2 = plaintext.indexOf(0, null1 + 1);
  const null3 = plaintext.indexOf(0, null2 + 1);
  const null4 = plaintext.indexOf(0, null3 + 1);
  if (null1 < 0 || null2 < 0 || null3 < 0 || null4 < 0) {
    throw forbidden("Invalid rebook link");
  }
  const clinicId = plaintext.subarray(0, null1).toString("utf8");
  const patientId = plaintext.subarray(null1 + 1, null2).toString("utf8");
  const prac = plaintext.subarray(null2 + 1, null3).toString("utf8");
  const expStr = plaintext.subarray(null3 + 1, null4).toString("utf8");
  const mac = plaintext.subarray(null4 + 1);
  if (!clinicId || !patientId || !expStr) throw forbidden("Invalid rebook link");
  if (Number(expStr) < Date.now()) {
    throw forbidden("This rebook link has expired");
  }
  const body = `${clinicId}\0${patientId}\0${prac}\0${expStr}`;
  const expected = createHmac("sha256", rebookSecret()).update(body).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw forbidden("Invalid rebook link");
  }
  return {
    clinicId,
    patientId,
    practitionerId: prac || null,
    percentOff: null,
    exp: Number(expStr),
  };
}

export function rebookUrlForToken(clinicSlug: string, token: string) {
  return `${getAppBaseUrl()}/book/${clinicSlug}?rebook=${encodeURIComponent(token)}`;
}

export function createPatientRebookUrl(args: {
  clinicSlug: string;
  clinicId: string;
  patientId: string;
  practitionerId?: string | null;
  percentOff?: number | null;
  ttlMs?: number;
}) {
  const token = createRebookToken(
    {
      clinicId: args.clinicId,
      patientId: args.patientId,
      practitionerId: args.practitionerId,
      percentOff: args.percentOff,
    },
    Date.now() + (args.ttlMs ?? REBOOK_TTL_MS),
  );
  return rebookUrlForToken(args.clinicSlug, token);
}

export function createPatientWinBackUrl(args: {
  clinicSlug: string;
  clinicId: string;
  patientId: string;
  practitionerId?: string | null;
}) {
  return createPatientRebookUrl({
    ...args,
    percentOff: WINBACK_PERCENT_OFF,
    ttlMs: WINBACK_TTL_MS,
  });
}

/** Load patient preview for the public book form (no clinical fields). */
export async function loadRebookPreview(token: string) {
  const payload = verifyRebookToken(token);
  const patient = await prisma.patient.findFirst({
    where: {
      id: payload.patientId,
      clinicId: payload.clinicId,
      archivedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      clinic: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!patient) throw notFound("Patient not found");
  return {
    clinicId: patient.clinic.id,
    clinicSlug: patient.clinic.slug,
    clinicName: patient.clinic.name,
    practitionerId: payload.practitionerId,
    percentOff: payload.percentOff ?? null,
    patient: {
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
    },
  };
}
