import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  createBlock,
  createBlockSchema,
  listBlocks,
} from "@/modules/scheduling/availability";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  const blocks = await listBlocks(ctx, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    practitionerId: url.searchParams.get("practitionerId") ?? undefined,
  });
  return jsonOk({ blocks });
});

export const POST = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const body = createBlockSchema.parse(await req.json());
  const block = await createBlock(ctx, body);
  return jsonCreated({ block });
});
