import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  acceptWaitlistOffer,
  cancelWaitlistEntry,
  declineWaitlistOffer,
} from "@/modules/scheduling/waitlist";

export const DELETE = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const entry = await cancelWaitlistEntry(ctx, params.id);
  return jsonOk({ entry });
});

export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "accept") {
    const result = await acceptWaitlistOffer(ctx, params.id);
    return jsonOk(result);
  }
  if (body.action === "decline") {
    const result = await declineWaitlistOffer(ctx, params.id);
    return jsonOk(result);
  }
  const entry = await cancelWaitlistEntry(ctx, params.id);
  return jsonOk({ entry });
});
