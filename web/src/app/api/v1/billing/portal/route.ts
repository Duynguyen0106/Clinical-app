import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { MembershipRole } from "@/generated/prisma/client";
import { createBillingPortalSession } from "@/modules/billing/subscription";

export const POST = withAuth(async (_req, ctx) => {
  requireRole(ctx, [MembershipRole.OWNER]);
  const portal = await createBillingPortalSession(ctx.clinicId);
  return jsonOk({ portal });
});
