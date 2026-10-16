import { z } from "zod";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanManageSchedule } from "@/server/rbac";
import { rescheduleFutureSeries } from "@/modules/scheduling/service";

const bodySchema = z.object({
  startsAt: z.string().datetime(),
});

export const POST = withAuth(async (req, ctx, params) => {
  assertCanManageSchedule(ctx);
  const body = bodySchema.parse(await req.json());
  const result = await rescheduleFutureSeries(ctx, params.id, body.startsAt);
  return jsonOk(result);
});
