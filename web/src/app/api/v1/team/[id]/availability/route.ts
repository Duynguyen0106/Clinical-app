import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import {
  replaceAvailability,
  updateAvailabilitySchema,
} from "@/modules/team/service";

export const PUT = withAuth(async (req, ctx, params) => {
  requireRole(ctx, ["OWNER"]);
  const body = updateAvailabilitySchema.parse(await req.json());
  const practitioner = await replaceAvailability(ctx, params.id, body);
  return jsonOk({ practitioner });
});
