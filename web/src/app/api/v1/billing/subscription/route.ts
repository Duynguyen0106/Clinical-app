import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { MembershipRole } from "@/generated/prisma/client";
import { getClinicSubscription } from "@/modules/billing/subscription";

export const GET = withAuth(async (_req, ctx) => {
  requireRole(ctx, [MembershipRole.OWNER]);
  const subscription = await getClinicSubscription(ctx.clinicId);
  return jsonOk({ subscription });
});
