import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { getVisit } from "@/modules/visits/service";
import { requireClinician } from "@/server/rbac";

export const GET = withAuth(async (_req, ctx, params) => {
  requireClinician(ctx);
  const visit = await getVisit(ctx, params.id);
  return jsonOk({ visit });
});
