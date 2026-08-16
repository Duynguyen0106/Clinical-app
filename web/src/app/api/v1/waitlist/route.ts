import { WaitlistStatus } from "@/generated/prisma/client";
import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  createWaitlistEntry,
  createWaitlistSchema,
  listWaitlist,
} from "@/modules/scheduling/waitlist";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const statusParam = new URL(req.url).searchParams.get("status");
  const status =
    statusParam &&
    Object.values(WaitlistStatus).includes(statusParam as WaitlistStatus)
      ? (statusParam as WaitlistStatus)
      : undefined;
  const entries = await listWaitlist(ctx, { status });
  return jsonOk({ entries });
});

export const POST = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const body = createWaitlistSchema.parse(await req.json());
  const entry = await createWaitlistEntry(ctx, body);
  return jsonCreated({ entry });
});
