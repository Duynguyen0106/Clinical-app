import { z } from "zod";
import type { AuthContext } from "@/server/auth";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import {
  deleteClinicLogoFile,
  readClinicLogo,
  saveClinicLogo,
} from "@/server/storage";

const HEX = /^#([0-9a-fA-F]{6})$/;

export const updateClinicProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  address: z.string().max(400).nullable().optional(),
  brandColour: z
    .union([z.string().regex(HEX), z.literal(""), z.null()])
    .optional(),
  calendarPrivacyMode: z.enum(["FULL_NAME", "INITIALS"]).optional(),
});

const profileSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  phone: true,
  email: true,
  address: true,
  brandColour: true,
  logoStorageKey: true,
  logoMimeType: true,
  audioRetentionDays: true,
  privacyNoticeVersion: true,
  dataRegion: true,
  calendarPrivacyMode: true,
} as const;

function toPublicProfile(clinic: {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  brandColour: string | null;
  logoStorageKey: string | null;
  logoMimeType: string | null;
  audioRetentionDays: number;
  privacyNoticeVersion: string;
  dataRegion: string;
  calendarPrivacyMode: "FULL_NAME" | "INITIALS";
}) {
  const { logoStorageKey, logoMimeType, ...rest } = clinic;
  return {
    ...rest,
    hasLogo: Boolean(logoStorageKey),
    logoUrl: logoStorageKey ? "/api/v1/clinic/logo" : null,
    logoMimeType: logoStorageKey ? logoMimeType : null,
  };
}

export async function getClinicProfile(ctx: AuthContext) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: profileSelect,
  });
  return toPublicProfile(clinic);
}

export async function updateClinicProfile(
  ctx: AuthContext,
  input: z.infer<typeof updateClinicProfileSchema>,
) {
  requireRole(ctx, ["OWNER"]);
  const clinic = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone?.trim() || null }
        : {}),
      ...(input.email !== undefined
        ? { email: input.email === "" ? null : input.email }
        : {}),
      ...(input.address !== undefined
        ? { address: input.address?.trim() || null }
        : {}),
      ...(input.brandColour !== undefined
        ? {
            brandColour:
              !input.brandColour || input.brandColour === ""
                ? null
                : input.brandColour.toUpperCase(),
          }
        : {}),
      ...(input.calendarPrivacyMode !== undefined
        ? { calendarPrivacyMode: input.calendarPrivacyMode }
        : {}),
    },
    select: profileSelect,
  });
  return toPublicProfile(clinic);
}

const ALLOWED_LOGO = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

/** Marker in logoStorageKey when bytes live in Clinic.logoBytes (serverless-safe). */
export const INLINE_LOGO_KEY = "inline";

export async function uploadClinicLogo(
  ctx: AuthContext,
  bytes: Buffer,
  mimeType: string,
) {
  requireRole(ctx, ["OWNER"]);
  if (!ALLOWED_LOGO.has(mimeType)) {
    throw badRequest("Logo must be PNG, JPEG, WebP, or SVG");
  }
  if (bytes.length === 0) throw badRequest("Empty logo file");
  if (bytes.length > 2 * 1024 * 1024) {
    throw badRequest("Logo must be under 2MB");
  }

  const existing = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { logoStorageKey: true },
  });
  // Best-effort clear legacy file/S3 object (ignore failures on ephemeral disk).
  if (
    existing.logoStorageKey &&
    existing.logoStorageKey !== INLINE_LOGO_KEY
  ) {
    try {
      await deleteClinicLogoFile(existing.logoStorageKey);
    } catch {
      /* ignore */
    }
  }

  // Persist in Postgres so Vercel (no writable disk / no S3) can serve logos.
  // Also best-effort mirror to local/S3 for hosts that have them.
  try {
    await saveClinicLogo(ctx.clinicId, bytes, mimeType);
  } catch {
    /* disk/S3 optional — DB is source of truth */
  }

  const clinic = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      logoStorageKey: INLINE_LOGO_KEY,
      logoMimeType: mimeType,
      logoBytes: new Uint8Array(bytes),
    },
    select: profileSelect,
  });
  return toPublicProfile(clinic);
}

export async function clearClinicLogo(ctx: AuthContext) {
  requireRole(ctx, ["OWNER"]);
  const existing = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { logoStorageKey: true },
  });
  if (
    existing.logoStorageKey &&
    existing.logoStorageKey !== INLINE_LOGO_KEY
  ) {
    try {
      await deleteClinicLogoFile(existing.logoStorageKey);
    } catch {
      /* ignore */
    }
  }
  const clinic = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: { logoStorageKey: null, logoMimeType: null, logoBytes: null },
    select: profileSelect,
  });
  return toPublicProfile(clinic);
}

export async function getClinicLogoBytes(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { logoStorageKey: true, logoMimeType: true, logoBytes: true },
  });
  if (!clinic?.logoStorageKey && !clinic?.logoBytes) {
    throw notFound("No clinic logo");
  }
  if (clinic.logoBytes && clinic.logoBytes.length > 0) {
    return {
      bytes: Buffer.from(clinic.logoBytes),
      mimeType: clinic.logoMimeType ?? "image/png",
    };
  }
  if (!clinic.logoStorageKey || clinic.logoStorageKey === INLINE_LOGO_KEY) {
    throw notFound("No clinic logo");
  }
  const bytes = await readClinicLogo(clinic.logoStorageKey);
  return {
    bytes,
    mimeType: clinic.logoMimeType ?? "image/png",
  };
}

export async function getPublicClinicLogoBySlug(slug: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: {
      id: true,
      logoStorageKey: true,
      logoMimeType: true,
      logoBytes: true,
    },
  });
  if (!clinic?.logoStorageKey && !clinic?.logoBytes) {
    throw notFound("No clinic logo");
  }
  if (clinic.logoBytes && clinic.logoBytes.length > 0) {
    return {
      bytes: Buffer.from(clinic.logoBytes),
      mimeType: clinic.logoMimeType ?? "image/png",
    };
  }
  if (!clinic.logoStorageKey || clinic.logoStorageKey === INLINE_LOGO_KEY) {
    throw notFound("No clinic logo");
  }
  const bytes = await readClinicLogo(clinic.logoStorageKey);
  return {
    bytes,
    mimeType: clinic.logoMimeType ?? "image/png",
  };
}

/** Data URL for embedding in print / PDF letterhead */
export async function clinicLogoDataUrl(clinicId: string) {
  try {
    const { bytes, mimeType } = await getClinicLogoBytes(clinicId);
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
