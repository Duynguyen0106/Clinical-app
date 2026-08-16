import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { getMe } from "@/modules/auth/service";

export const GET = withAuth(async (_req, ctx) => {
  const me = await getMe(ctx.userId, ctx.clinicId);
  return jsonOk(me);
});
