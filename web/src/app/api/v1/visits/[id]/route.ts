import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { getVisit } from "@/modules/visits/service";

export const GET = withAuth(async (_req, ctx, params) => {
  const visit = await getVisit(ctx, params.id);
  return jsonOk({ visit });
});
