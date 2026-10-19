import { createHmac, timingSafeEqual } from "node:crypto";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import { applyStripeSubscriptionEvent } from "@/modules/billing/subscription";
import { applyDepositCheckoutCompleted } from "@/modules/billing/deposits";

function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    const key = k?.trim();
    const val = v?.trim() ?? "";
    if (key === "t") timestamp = val;
    if (key === "v1" && val) signatures.push(val);
  }
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  for (const signature of signatures) {
    try {
      const b = Buffer.from(signature, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* try next v1 */
    }
  }
  return false;
}

export const POST = withPublic(async (req) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  // Always require a verified signature — never accept unsigned webhook bodies
  if (!secret) {
    throw unauthorized("STRIPE_WEBHOOK_SECRET not configured");
  }
  if (!verifyStripeSignature(raw, sig, secret)) {
    throw unauthorized("Invalid Stripe signature");
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    throw badRequest("Invalid JSON");
  }

  let deposit: { applied: boolean; appointmentId?: string } = {
    applied: false,
  };
  if (event.type === "checkout.session.completed") {
    deposit = await applyDepositCheckoutCompleted(
      event.data.object as {
        id?: string;
        mode?: string;
        payment_status?: string;
        metadata?: { appointmentId?: string; clinicId?: string };
      },
    );
  }

  const result = await applyStripeSubscriptionEvent(event);
  return jsonOk({ received: true, result, deposit });
});
