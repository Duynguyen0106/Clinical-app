import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getPractitionerPay,
  upsertPayRateSchema,
  upsertPractitionerPay,
} from "@/modules/team/pay";

export const GET = withAuth(async (_req, ctx, params) => {
  const pay = await getPractitionerPay(ctx, params.id);
  return jsonOk(pay);
});

export const PUT = withAuth(async (req, ctx, params) => {
  const body = upsertPayRateSchema.parse(await req.json());
  const result = await upsertPractitionerPay(ctx, params.id, body);
  return jsonOk(result);
});
