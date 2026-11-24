import { NextResponse } from "next/server";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  deletePatientFile,
  getPatientFileDownload,
} from "@/modules/patients/files";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const file = await getPatientFileDownload(ctx, params.id, params.fileId);
  const disposition = `attachment; filename="${file.filename}"`;
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const DELETE = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const result = await deletePatientFile(ctx, params.id, params.fileId);
  return jsonOk(result);
});
