import { withAuth } from "@/server/api";
import { jsonCreated } from "@/server/http";
import { addConsent, consentSchema } from "@/modules/patients/service";

export const POST = withAuth(async (req, ctx, params) => {
  const body = consentSchema.parse(await req.json());
  const consent = await addConsent(ctx, params.id, body);
  return jsonCreated({ consent });
});
