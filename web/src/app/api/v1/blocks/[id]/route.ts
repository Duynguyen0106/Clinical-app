import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { deleteBlock } from "@/modules/scheduling/availability";

export const DELETE = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const result = await deleteBlock(ctx, params.id);
  return jsonOk(result);
});
