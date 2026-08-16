import { NextResponse } from "next/server";
import { withPublic } from "@/server/api";
import { getPublicClinicLogoBySlug } from "@/modules/clinic/profile";

export const GET = withPublic(async (_req, params) => {
  const { bytes, mimeType } = await getPublicClinicLogoBySlug(params.slug);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=300",
    },
  });
});
