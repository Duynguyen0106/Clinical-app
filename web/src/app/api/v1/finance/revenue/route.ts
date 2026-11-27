import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getRevenueReport,
  revenueQuerySchema,
} from "@/modules/billing/revenue";

export const GET = withAuth(async (req, ctx) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const query = revenueQuerySchema.parse(params);
  const report = await getRevenueReport(ctx, query);
  return jsonOk(report);
});
