import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  listPublicMultiPractitionerSlots,
  listPublicSlots,
} from "@/modules/scheduling/slots";
import { enforcePublicSlotsLimits } from "@/server/abuse";

export const GET = withPublic(async (req, params) => {
  await enforcePublicSlotsLimits(req);
  const url = new URL(req.url);
  const appointmentTypeId = url.searchParams.get("appointmentTypeId");
  if (!appointmentTypeId) {
    throw badRequest("appointmentTypeId required");
  }
  const practitionerId = url.searchParams.get("practitionerId");
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number(daysRaw) : undefined;
  if (daysRaw && (!Number.isFinite(days) || (days ?? 0) < 1)) {
    throw badRequest("Invalid days");
  }

  // Omit practitionerId or pass "any" → multi-practitioner in one response.
  if (!practitionerId || practitionerId === "any") {
    const slots = await listPublicMultiPractitionerSlots({
      slug: params.slug,
      appointmentTypeId,
      days,
    });
    return jsonOk({ slots, mode: "any" as const });
  }

  const slots = await listPublicSlots({
    slug: params.slug,
    appointmentTypeId,
    practitionerId,
    days,
  });
  return jsonOk({ slots, mode: "practitioner" as const });
});
