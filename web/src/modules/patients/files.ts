import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, forbidden, notFound } from "@/server/errors";
import {
  deletePatientFileBytes,
  readPatientFileBytes,
  savePatientFileBytes,
} from "@/server/storage";
import { requirePatient } from "@/modules/patients/service";

export const PATIENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const PATIENT_FILE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function assertAllowedPatientFile(opts: {
  mimeType: string;
  sizeBytes: number;
  filename?: string;
}) {
  const mime = opts.mimeType.trim().toLowerCase();
  if (!PATIENT_FILE_ALLOWED_MIME.has(mime)) {
    throw badRequest("Only PDF, JPEG, and PNG files are allowed");
  }
  if (!opts.sizeBytes || opts.sizeBytes <= 0) {
    throw badRequest("Empty file");
  }
  if (opts.sizeBytes > PATIENT_FILE_MAX_BYTES) {
    throw badRequest("File must be 10 MB or smaller");
  }
  return mime;
}

function sanitizeFilename(raw: string, mime: string) {
  const base = raw
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .trim()
    .slice(0, 180);
  if (base && /\.\w{2,5}$/.test(base)) return base;
  const ext = MIME_EXT[mime] ?? "bin";
  return `${base || "attachment"}.${ext}`;
}

/** Practitioners may only touch patients who appear on their diary. */
async function assertDiaryAccess(ctx: AuthContext, patientId: string) {
  if (ctx.role !== "PRACTITIONER") return;
  if (!ctx.practitionerProfileId) throw notFound("Patient not found");
  const apt = await prisma.appointment.findFirst({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      practitionerId: ctx.practitionerProfileId,
    },
    select: { id: true },
  });
  if (!apt) throw notFound("Patient not found");
}

function serializeFile(row: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    uploadedBy: row.uploadedBy
      ? { id: row.uploadedBy.id, name: row.uploadedBy.name }
      : null,
  };
}

export async function listPatientFiles(ctx: AuthContext, patientId: string) {
  await requirePatient(ctx.clinicId, patientId);
  await assertDiaryAccess(ctx, patientId);
  const files = await prisma.patientFile.findMany({
    where: { clinicId: ctx.clinicId, patientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });
  return files.map(serializeFile);
}

export async function uploadPatientFile(
  ctx: AuthContext,
  patientId: string,
  opts: { filename: string; mimeType: string; bytes: Buffer },
) {
  await requirePatient(ctx.clinicId, patientId);
  await assertDiaryAccess(ctx, patientId);

  const mime = assertAllowedPatientFile({
    mimeType: opts.mimeType,
    sizeBytes: opts.bytes.length,
    filename: opts.filename,
  });
  const filename = sanitizeFilename(opts.filename || "attachment", mime);
  const id = `pf_${randomBytes(12).toString("hex")}`;

  const storageKey = await savePatientFileBytes(
    ctx.clinicId,
    patientId,
    id,
    opts.bytes,
  );

  try {
    const row = await prisma.patientFile.create({
      data: {
        id,
        clinicId: ctx.clinicId,
        patientId,
        filename,
        mimeType: mime,
        sizeBytes: opts.bytes.length,
        storageKey,
        uploadedById: ctx.userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
    void prisma.patientAccessEvent
      .create({
        data: {
          clinicId: ctx.clinicId,
          patientId,
          actorId: ctx.userId,
          action: "file_uploaded",
          meta: {
            fileId: row.id,
            filename: row.filename,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
          },
        },
      })
      .catch(() => undefined);
    return serializeFile(row);
  } catch (err) {
    await deletePatientFileBytes(storageKey);
    throw err;
  }
}

export async function getPatientFileDownload(
  ctx: AuthContext,
  patientId: string,
  fileId: string,
) {
  await requirePatient(ctx.clinicId, patientId);
  await assertDiaryAccess(ctx, patientId);

  const row = await prisma.patientFile.findFirst({
    where: { id: fileId, clinicId: ctx.clinicId, patientId },
  });
  if (!row) throw notFound("File not found");

  const bytes = await readPatientFileBytes(row.storageKey);
  void prisma.patientAccessEvent
    .create({
      data: {
        clinicId: ctx.clinicId,
        patientId,
        actorId: ctx.userId,
        action: "file_downloaded",
        meta: { fileId: row.id, filename: row.filename },
      },
    })
    .catch(() => undefined);

  return {
    filename: row.filename,
    mimeType: row.mimeType,
    bytes,
  };
}

export async function deletePatientFile(
  ctx: AuthContext,
  patientId: string,
  fileId: string,
) {
  await requirePatient(ctx.clinicId, patientId);
  await assertDiaryAccess(ctx, patientId);

  const row = await prisma.patientFile.findFirst({
    where: { id: fileId, clinicId: ctx.clinicId, patientId },
  });
  if (!row) throw notFound("File not found");

  // Reception / owners can delete any; practitioners only their own uploads
  if (
    ctx.role === "PRACTITIONER" &&
    row.uploadedById &&
    row.uploadedById !== ctx.userId
  ) {
    throw forbidden("You can only delete files you uploaded");
  }

  await prisma.patientFile.delete({ where: { id: row.id } });
  await deletePatientFileBytes(row.storageKey);
  void prisma.patientAccessEvent
    .create({
      data: {
        clinicId: ctx.clinicId,
        patientId,
        actorId: ctx.userId,
        action: "file_deleted",
        meta: { fileId: row.id, filename: row.filename },
      },
    })
    .catch(() => undefined);
  return { ok: true as const };
}
