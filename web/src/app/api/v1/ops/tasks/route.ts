import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { listOpsTasks } from "@/modules/ops/tasks";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const tasks = await listOpsTasks(ctx);
  return jsonOk({ tasks, count: tasks.length });
});
