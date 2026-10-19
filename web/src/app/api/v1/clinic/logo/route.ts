import { NextResponse } from "next/server";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  clearClinicLogo,
  getClinicLogoBytes,
  uploadClinicLogo,
} from "@/modules/clinic/profile";
import { requireStaff } from "@/server/rbac";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const { bytes, mimeType } = await getClinicLogoBytes(ctx.clinicId);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
});

export const POST = withAuth(async (req, ctx) => {
  const form = await req.formData();
  const file = form.get("logo");
  // Undici/Next may yield File or Blob depending on runtime.
  if (typeof file === "string" || !(file instanceof Blob)) {
    throw badRequest("logo file required");
  }
  const mime = file.type?.trim() || "image/png";
  const bytes = Buffer.from(await file.arrayBuffer());
  const clinic = await uploadClinicLogo(ctx, bytes, mime);
  return jsonOk({ clinic });
});

export const DELETE = withAuth(async (_req, ctx) => {
  const clinic = await clearClinicLogo(ctx);
  return jsonOk({ clinic });
});
