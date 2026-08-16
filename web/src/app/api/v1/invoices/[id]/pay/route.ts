import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  markInvoicePaid,
  markInvoiceUnpaid,
  markPaidSchema,
} from "@/modules/billing/service";
import { requireOwnerOrReception } from "@/server/rbac";

export const POST = withAuth(async (req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const body = markPaidSchema.parse(await req.json().catch(() => ({})));
  const invoice = await markInvoicePaid(ctx, params.id, body);
  return jsonOk({ invoice });
});

export const DELETE = withAuth(async (_req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const invoice = await markInvoiceUnpaid(ctx, params.id);
  return jsonOk({ invoice });
});
