import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  ensureInvoiceForVisit,
  markInvoicePaid,
  markPaidSchema,
} from "@/modules/billing/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const invoice = await ensureInvoiceForVisit(ctx, params.id);
  return jsonOk({ invoice });
});

/** End-of-visit mark paid — clinicians or front desk */
export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const invoice = await ensureInvoiceForVisit(ctx, params.id);
  const body = markPaidSchema.parse(await req.json().catch(() => ({})));
  const paid = await markInvoicePaid(ctx, invoice.id, body);
  return jsonOk({ invoice: paid });
});
