import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { LeaveRequestStatus } from "@/generated/prisma/client";
import {
  createLeaveRequest,
  createLeaveRequestSchema,
  listLeaveRequests,
} from "@/modules/scheduling/leave";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam &&
    Object.values(LeaveRequestStatus).includes(
      statusParam as LeaveRequestStatus,
    )
      ? (statusParam as LeaveRequestStatus)
      : undefined;
  const requests = await listLeaveRequests(ctx, {
    status,
    practitionerId: url.searchParams.get("practitionerId") ?? undefined,
    pendingOnly: url.searchParams.get("pending") === "1",
  });
  return jsonOk({ requests });
});

export const POST = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const body = createLeaveRequestSchema.parse(await req.json());
  const request = await createLeaveRequest(ctx, body);
  return jsonCreated({ request });
});
