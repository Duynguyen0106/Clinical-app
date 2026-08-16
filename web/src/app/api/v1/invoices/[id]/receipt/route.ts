import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { buildReceiptDocument } from "@/modules/billing/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const document = await buildReceiptDocument(ctx, params.id);
  return jsonOk({ document });
});
