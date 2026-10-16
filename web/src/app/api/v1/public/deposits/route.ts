import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  createDepositCheckout,
  verifyStripeDepositSession,
} from "@/modules/billing/deposits";
import { enforcePublicDepositLimits } from "@/server/abuse";

export const POST = withPublic(async (req) => {
  await enforcePublicDepositLimits(req);
  const body = (await req.json()) as {
    appointmentId?: string;
    action?: string;
    sessionId?: string;
  };
  if (!body.appointmentId) throw badRequest("appointmentId required");

  // Verify Stripe Checkout session — never trust a bare mark_paid from the client
  if (body.action === "verify_session") {
    if (!body.sessionId) throw badRequest("sessionId required");
    const result = await verifyStripeDepositSession({
      sessionId: body.sessionId,
      appointmentId: body.appointmentId,
    });
    return jsonOk(result);
  }

  if (body.action === "mark_paid") {
    throw badRequest(
      "Direct mark_paid is disabled. Complete Stripe Checkout or use verify_session.",
    );
  }

  const result = await createDepositCheckout(body.appointmentId);
  return jsonOk(result);
});
