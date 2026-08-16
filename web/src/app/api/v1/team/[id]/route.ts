import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  updatePractitioner,
  updatePractitionerSchema,
} from "@/modules/team/service";
import { requireStaff } from "@/server/rbac";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = updatePractitionerSchema.parse(await req.json());
  const practitioner = await updatePractitioner(ctx, params.id, body);
  return jsonOk({ practitioner });
});
