import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanManageSchedule } from "@/server/rbac";
import { cancelFutureSeries } from "@/modules/scheduling/service";

export const POST = withAuth(async (_req, ctx, params) => {
  assertCanManageSchedule(ctx);
  const result = await cancelFutureSeries(ctx, params.id);
  return jsonOk(result);
});
