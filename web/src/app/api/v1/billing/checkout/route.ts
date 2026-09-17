import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { MembershipRole } from "@/generated/prisma/client";
import { badRequest } from "@/server/errors";
import { createSubscriptionCheckout } from "@/modules/billing/subscription";

export const POST = withAuth(async (req, ctx) => {
  requireRole(ctx, [MembershipRole.OWNER]);
  const body = (await req.json()) as { plan?: string };
  if (body.plan !== "STARTER" && body.plan !== "CLINIC") {
    throw badRequest("plan must be STARTER or CLINIC");
  }
  const checkout = await createSubscriptionCheckout({
    clinicId: ctx.clinicId,
    ownerEmail: ctx.email,
    plan: body.plan,
  });
  return jsonOk({ checkout });
});
