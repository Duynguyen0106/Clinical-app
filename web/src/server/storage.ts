import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "storage", "audio");

export function audioPath(clinicId: string, visitId: string, filename = "audio.webm") {
  return path.join(ROOT, clinicId, visitId, filename);
}

export async function saveAudioUpload(
  clinicId: string,
  visitId: string,
  bytes: Buffer,
  filename = "audio.webm",
) {
  const dir = path.join(ROOT, clinicId, visitId);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  await writeFile(full, bytes);
  return `clinics/${clinicId}/visits/${visitId}/${filename}`;
}

export async function readAudioFile(storageKey: string) {
  // storageKey: clinics/{clinicId}/visits/{visitId}/audio.webm
  const parts = storageKey.split("/");
  if (parts.length < 5 || parts[0] !== "clinics") {
    throw new Error("Invalid storage key");
  }
  const clinicId = parts[1];
  const visitId = parts[3];
  const filename = parts.slice(4).join("/") || "audio.webm";
  const full = audioPath(clinicId, visitId, filename);
  await access(full);
  return readFile(full);
}

export async function appendAudioChunk(
  clinicId: string,
  visitId: string,
  chunk: Buffer,
) {
  const dir = path.join(ROOT, clinicId, visitId);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, "audio.webm");
  const { appendFile } = await import("node:fs/promises");
  await appendFile(full, chunk);
  return `clinics/${clinicId}/visits/${visitId}/audio.webm`;
}
