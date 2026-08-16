import { InvoiceStatus } from "@/generated/prisma/client";
import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  createInvoice,
  createInvoiceSchema,
  listInvoices,
} from "@/modules/billing/service";
import { requireOwnerOrReception, requireStaff } from "@/server/rbac";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const statusParam = new URL(req.url).searchParams.get("status");
  const status =
    statusParam &&
    Object.values(InvoiceStatus).includes(statusParam as InvoiceStatus)
      ? (statusParam as InvoiceStatus)
      : undefined;
  const invoices = await listInvoices(ctx, { status });
  return jsonOk({ invoices });
});

export const POST = withAuth(async (req, ctx) => {
  requireOwnerOrReception(ctx);
  const body = createInvoiceSchema.parse(await req.json());
  const invoice = await createInvoice(ctx, body);
  return jsonCreated({ invoice });
});
