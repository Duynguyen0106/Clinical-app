import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  createDepositCheckout,
  markDepositPaid,
} from "@/modules/billing/deposits";
import { enforcePublicDepositLimits } from "@/server/abuse";

export const POST = withPublic(async (req) => {
  enforcePublicDepositLimits(req);
  const body = (await req.json()) as {
    appointmentId?: string;
    action?: string;
  };
  if (!body.appointmentId) throw badRequest("appointmentId required");
  if (body.action === "mark_paid") {
    // Used by Stripe success redirect / console confirm
    const appointment = await markDepositPaid(body.appointmentId);
    return jsonOk({ appointment });
  }
  const result = await createDepositCheckout(body.appointmentId);
  return jsonOk(result);
});
