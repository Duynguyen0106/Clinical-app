import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import {
  updatePractitioner,
  updatePractitionerSchema,
} from "@/modules/team/service";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireRole(ctx, ["OWNER"]);
  const body = updatePractitionerSchema.parse(await req.json());
  const practitioner = await updatePractitioner(ctx, params.id, body);
  return jsonOk({ practitioner });
});
