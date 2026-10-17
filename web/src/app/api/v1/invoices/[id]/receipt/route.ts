import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireOwnerOrReception } from "@/server/rbac";
import { buildReceiptDocument } from "@/modules/billing/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const document = await buildReceiptDocument(ctx, params.id);
  return jsonOk({ document });
});
