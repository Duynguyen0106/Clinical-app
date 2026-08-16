import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  replaceAvailability,
  updateAvailabilitySchema,
} from "@/modules/team/service";
import { requireStaff } from "@/server/rbac";

export const PUT = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = updateAvailabilitySchema.parse(await req.json());
  const practitioner = await replaceAvailability(ctx, params.id, body);
  return jsonOk({ practitioner });
});
