import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { requireOwnerOrReception, requireStaff } from "@/server/rbac";
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  rejectLeaveRequest,
  reviewLeaveRequestSchema,
} from "@/modules/scheduling/leave";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = (await req.json()) as {
    action?: string;
    note?: string | null;
  };
  const action = body.action;
  const note = reviewLeaveRequestSchema.parse({ note: body.note }).note;

  if (action === "approve") {
    requireOwnerOrReception(ctx);
    const request = await approveLeaveRequest(ctx, params.id, note);
    return jsonOk({ request });
  }
  if (action === "reject") {
    requireOwnerOrReception(ctx);
    const request = await rejectLeaveRequest(ctx, params.id, note);
    return jsonOk({ request });
  }
  if (action === "cancel") {
    const request = await cancelLeaveRequest(ctx, params.id);
    return jsonOk({ request });
  }

  throw badRequest("Unknown action — use approve, reject, or cancel");
});
