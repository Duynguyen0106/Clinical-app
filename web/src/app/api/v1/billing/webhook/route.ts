import { createHmac, timingSafeEqual } from "node:crypto";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import { applyStripeSubscriptionEvent } from "@/modules/billing/subscription";

function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const POST = withPublic(async (req) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!secret) {
    // Allow console/dev without webhook secret only outside production
    if (process.env.NODE_ENV === "production") {
      throw unauthorized("STRIPE_WEBHOOK_SECRET not configured");
    }
  } else if (!verifyStripeSignature(raw, sig, secret)) {
    throw unauthorized("Invalid Stripe signature");
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    throw badRequest("Invalid JSON");
  }

  const result = await applyStripeSubscriptionEvent(event);
  return jsonOk({ received: true, result });
});
