import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { getPracticePulse } from "@/modules/ops/pulse";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const pulse = await getPracticePulse(ctx);
  return jsonOk({ pulse });
});
