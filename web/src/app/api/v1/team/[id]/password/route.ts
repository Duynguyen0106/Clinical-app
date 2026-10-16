import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  ownerSetPasswordSchema,
  ownerSetPractitionerPassword,
} from "@/modules/team/service";
import { requireRole } from "@/server/auth";

export const POST = withAuth(async (req, ctx, params) => {
  requireRole(ctx, ["OWNER"]);
  const body = ownerSetPasswordSchema.parse(await req.json());
  const result = await ownerSetPractitionerPassword(ctx, params.id, body);
  return jsonOk(result);
});
