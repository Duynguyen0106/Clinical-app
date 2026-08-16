import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  captureRecordingConsent,
  consentRecordingSchema,
} from "@/modules/visits/service";

export const POST = withAuth(async (req, ctx, params) => {
  const body = consentRecordingSchema.parse(await req.json());
  const visit = await captureRecordingConsent(ctx, params.id, body);
  return jsonOk({ visit });
});
