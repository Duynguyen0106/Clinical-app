import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { listPublicSlots } from "@/modules/scheduling/slots";

export const GET = withPublic(async (req, params) => {
  const url = new URL(req.url);
  const appointmentTypeId = url.searchParams.get("appointmentTypeId");
  const practitionerId = url.searchParams.get("practitionerId");
  if (!appointmentTypeId || !practitionerId) {
    throw badRequest("appointmentTypeId and practitionerId required");
  }
  const slots = await listPublicSlots({
    slug: params.slug,
    appointmentTypeId,
    practitionerId,
  });
  return jsonOk({ slots });
});
