import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireOwnerOrReception } from "@/server/rbac";
import { emailInvoiceReceipt } from "@/modules/billing/service";

export const POST = withAuth(async (_req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const result = await emailInvoiceReceipt(ctx, params.id);
  return jsonOk(result);
});
