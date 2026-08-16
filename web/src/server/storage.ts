import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, access, unlink, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "storage", "audio");
const BRAND_ROOT = path.join(process.cwd(), "storage", "brand");
const ENC_SUFFIX = ".enc";

function encryptionKey() {
  const secret =
    process.env.AUDIO_ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    "treow-dev-secret-change-me";
  return createHash("sha256").update(secret).digest();
}

export function encryptBytes(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptBytes(payload: Buffer) {
  if (payload.length < 28) {
    // legacy plaintext fallback
    return payload;
  }
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    // Not encrypted with current key — return as plaintext legacy
    return payload;
  }
}

export function audioPath(
  clinicId: string,
  visitId: string,
  filename = `audio.webm${ENC_SUFFIX}`,
) {
  return path.join(ROOT, clinicId, visitId, filename);
}

export async function saveAudioUpload(
  clinicId: string,
  visitId: string,
  bytes: Buffer,
  opts: { extension?: string } = {},
) {
  const dir = path.join(ROOT, clinicId, visitId);
  await mkdir(dir, { recursive: true });
  const ext = (opts.extension ?? "webm").replace(/[^a-z0-9]/gi, "") || "webm";
  const filename = `audio.${ext}${ENC_SUFFIX}`;
  // Remove prior audio variants so one consult keeps one blob
  for (const stale of ["webm", "mp4", "aac", "ogg", "m4a"]) {
    try {
      await unlink(path.join(dir, `audio.${stale}${ENC_SUFFIX}`));
    } catch {
      /* ignore */
    }
    try {
      await unlink(path.join(dir, `audio.${stale}`));
    } catch {
      /* ignore */
    }
  }
  const full = path.join(dir, filename);
  await writeFile(full, encryptBytes(bytes));
  return `clinics/${clinicId}/visits/${visitId}/${filename}`;
}

export async function readAudioFile(storageKey: string) {
  const parts = storageKey.split("/");
  if (parts.length < 5 || parts[0] !== "clinics") {
    throw new Error("Invalid storage key");
  }
  const clinicId = parts[1];
  const visitId = parts[3];
  const filename = parts.slice(4).join("/") || `audio.webm${ENC_SUFFIX}`;
  const full = audioPath(clinicId, visitId, filename);
  try {
    await access(full);
    const raw = await readFile(full);
    return filename.endsWith(ENC_SUFFIX) ? decryptBytes(raw) : raw;
  } catch {
    // try legacy unencrypted path
    const legacy = audioPath(clinicId, visitId, "audio.webm");
    await access(legacy);
    return readFile(legacy);
  }
}

export async function deleteAudioForVisit(clinicId: string, visitId: string) {
  const dir = path.join(ROOT, clinicId, visitId);
  try {
    await rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function deleteAudioByStorageKey(storageKey: string) {
  const parts = storageKey.split("/");
  if (parts.length < 5 || parts[0] !== "clinics") return false;
  const clinicId = parts[1];
  const visitId = parts[3];
  const filename = parts.slice(4).join("/");
  const full = audioPath(clinicId, visitId, filename);
  try {
    await unlink(full);
  } catch {
    /* ignore */
  }
  // also try removing directory if empty
  try {
    await rm(path.join(ROOT, clinicId, visitId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return true;
}

/** Clinic brand assets (logos) — stored unencrypted for serving on booking/print */
export function clinicLogoPath(clinicId: string, filename: string) {
  return path.join(BRAND_ROOT, clinicId, filename);
}

export async function saveClinicLogo(
  clinicId: string,
  bytes: Buffer,
  mimeType: string,
) {
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/svg+xml"
          ? "svg"
          : "jpg";
  const filename = `logo.${ext}`;
  const dir = path.join(BRAND_ROOT, clinicId);
  await mkdir(dir, { recursive: true });
  // Remove previous extensions so only one logo remains
  for (const stale of ["logo.png", "logo.jpg", "logo.jpeg", "logo.webp", "logo.svg"]) {
    try {
      await unlink(path.join(dir, stale));
    } catch {
      /* ignore */
    }
  }
  await writeFile(path.join(dir, filename), bytes);
  return {
    storageKey: `clinics/${clinicId}/brand/${filename}`,
    mimeType,
  };
}

export async function readClinicLogo(storageKey: string) {
  const parts = storageKey.split("/");
  if (parts.length < 4 || parts[0] !== "clinics" || parts[2] !== "brand") {
    throw new Error("Invalid logo storage key");
  }
  const clinicId = parts[1];
  const filename = parts.slice(3).join("/");
  const full = clinicLogoPath(clinicId, filename);
  await access(full);
  return readFile(full);
}

export async function deleteClinicLogoFile(storageKey: string) {
  try {
    const parts = storageKey.split("/");
    if (parts.length < 4 || parts[0] !== "clinics" || parts[2] !== "brand") {
      return false;
    }
    const clinicId = parts[1];
    const filename = parts.slice(3).join("/");
    await unlink(clinicLogoPath(clinicId, filename));
    return true;
  } catch {
    return false;
  }
}

