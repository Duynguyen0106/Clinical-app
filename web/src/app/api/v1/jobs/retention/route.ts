import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { runAudioRetention } from "@/modules/compliance/retention";

export const POST = withAuth(async (_req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const result = await runAudioRetention(ctx.clinicId);
  return jsonOk(result);
});
