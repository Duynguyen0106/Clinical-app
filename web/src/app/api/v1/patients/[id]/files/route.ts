import { NextResponse } from "next/server";
import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { requireStaff } from "@/server/rbac";
import {
  listPatientFiles,
  uploadPatientFile,
} from "@/modules/patients/files";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const files = await listPatientFiles(ctx, params.id);
  return jsonOk({ files });
});

export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const form = await req.formData();
  const file = form.get("file");
  if (typeof file === "string" || !(file instanceof Blob)) {
    throw badRequest("file required");
  }
  const mime = (file.type || "").trim() || "application/octet-stream";
  const filename =
    typeof (file as File).name === "string" && (file as File).name
      ? (file as File).name
      : "attachment";
  const bytes = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadPatientFile(ctx, params.id, {
    filename,
    mimeType: mime,
    bytes,
  });
  return jsonCreated({ file: uploaded });
});
