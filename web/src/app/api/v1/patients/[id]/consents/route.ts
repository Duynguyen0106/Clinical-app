import { withAuth } from "@/server/api";
import { jsonCreated } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { addConsent, consentSchema } from "@/modules/patients/service";

export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = consentSchema.parse(await req.json());
  const consent = await addConsent(ctx, params.id, body);
  return jsonCreated({ consent });
});
