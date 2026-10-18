import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  createDepositCheckout,
  getDepositPaymentInfo,
  verifyStripeDepositSession,
} from "@/modules/billing/deposits";
import { enforcePublicDepositLimits } from "@/server/abuse";

export const POST = withPublic(async (req) => {
  await enforcePublicDepositLimits(req);
  const body = (await req.json()) as {
    appointmentId?: string;
    token?: string;
    action?: string;
    sessionId?: string;
  };

  if (!body.token) throw badRequest("Manage token required");

  // Verify Stripe Checkout session — never trust a bare mark_paid from the client
  if (body.action === "verify_session") {
    if (!body.sessionId) throw badRequest("sessionId required");
    const result = await verifyStripeDepositSession({
      sessionId: body.sessionId,
      token: body.token,
    });
    return jsonOk(result);
  }

  if (body.action === "mark_paid") {
    throw badRequest(
      "Direct mark_paid is disabled. Complete Stripe Checkout or use verify_session.",
    );
  }

  // Read-only: bank instructions / deposit status (no Stripe session, no console PAID)
  if (body.action === "info" || body.action === "instructions") {
    const result = await getDepositPaymentInfo({ token: body.token });
    return jsonOk(result);
  }

  const result = await createDepositCheckout({
    token: body.token,
    appointmentId: body.appointmentId,
  });
  return jsonOk(result);
});
