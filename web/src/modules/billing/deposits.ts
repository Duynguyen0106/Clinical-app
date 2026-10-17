/**
 * Deposit payments — PAYMENT_PROVIDER=console|stripe
 * Console marks deposits paid immediately (pilot / demo only — blocked in production).
 * Stripe returns a Checkout URL; PAID is set only via verified session or webhook.
 * Public checkout/verify require a manage token (no bare appointment UUID fishing).
 */
import { DepositStatus, AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, notFound, unauthorized } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";
import { withClinicTransaction } from "@/server/clinic-rls";
import {
  createManageToken,
  manageTokenTtlMs,
  verifyManageToken,
} from "@/modules/scheduling/manage";

export function getPaymentProvider() {
  return (process.env.PAYMENT_PROVIDER ?? "console").toLowerCase();
}

async function resolveManageToken(opts: {
  token?: string;
  appointmentId?: string;
}): Promise<{ appointmentId: string; token: string }> {
  if (opts.token) {
    const { appointmentId } = verifyManageToken(opts.token);
    if (opts.appointmentId && opts.appointmentId !== appointmentId) {
      throw unauthorized("Manage token does not match this appointment");
    }
    return { appointmentId, token: opts.token };
  }
  if (!opts.appointmentId) {
    throw badRequest("Manage token required");
  }
  // Trusted server paths (post-book) mint a short-lived manage token
  const apt = await prisma.appointment.findUnique({
    where: { id: opts.appointmentId },
    select: {
      id: true,
      clinic: { select: { cancelMinNoticeHours: true } },
    },
  });
  if (!apt) throw notFound("Appointment not found");
  const hours = apt.clinic.cancelMinNoticeHours ?? 24;
  const token = createManageToken(
    apt.id,
    Date.now() + manageTokenTtlMs(hours),
  );
  return { appointmentId: apt.id, token };
}

export async function createDepositCheckout(opts: {
  token?: string;
  /** Trusted server-only: mint token when omitted */
  appointmentId?: string;
}) {
  const { appointmentId, token } = await resolveManageToken(opts);
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      clinic: true,
      appointmentType: true,
    },
  });
  if (!apt) throw notFound("Appointment not found");
  if (apt.depositStatus === DepositStatus.PAID) {
    return {
      status: "already_paid" as const,
      depositCents: apt.depositCents,
      checkoutUrl: null as string | null,
    };
  }
  if (apt.depositStatus !== DepositStatus.REQUIRED || apt.depositCents <= 0) {
    throw badRequest("No deposit is required for this appointment");
  }

  const provider = getPaymentProvider();
  const pounds = (apt.depositCents / 100).toFixed(2);
  const successUrl = `${getAppBaseUrl()}/book/manage/deposit-success?token=${encodeURIComponent(token)}`;
  const cancelUrl = `${getAppBaseUrl()}/book/${apt.clinic.slug}`;

  if (provider === "stripe") {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) {
      throw badRequest("STRIPE_SECRET_KEY is not configured");
    }
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${successUrl}&session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", cancelUrl);
    params.set("customer_email", apt.patient.email ?? "");
    params.set("line_items[0][price_data][currency]", "gbp");
    params.set(
      "line_items[0][price_data][product_data][name]",
      `Deposit — ${apt.appointmentType.name} at ${apt.clinic.name}`,
    );
    params.set(
      "line_items[0][price_data][unit_amount]",
      String(apt.depositCents),
    );
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[appointmentId]", apt.id);
    params.set("metadata[clinicId]", apt.clinicId);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Stripe checkout failed", text);
      throw badRequest("Could not start card payment");
    }
    const session = (await res.json()) as { id: string; url: string };
    console.info(
      `[payments:stripe] deposit checkout £${pounds} apt=${apt.id} session=${session.id}`,
    );
    return {
      status: "checkout" as const,
      depositCents: apt.depositCents,
      checkoutUrl: session.url,
      provider: "stripe" as const,
    };
  }

  // Console marks paid immediately — never in production (fake money)
  if (process.env.NODE_ENV === "production") {
    throw badRequest(
      "Card deposits require PAYMENT_PROVIDER=stripe and STRIPE_SECRET_KEY in production. Disable deposit requirements or configure Stripe.",
    );
  }

  await withClinicTransaction(apt.clinicId, async (tx) => {
    await tx.appointment.update({
      where: { id: apt.id },
      data: {
        depositStatus: DepositStatus.PAID,
        depositPaidAt: new Date(),
        status: AppointmentStatus.CONFIRMED,
      },
    });
  });
  console.info(
    `[payments:console] deposit £${pounds} marked PAID for apt=${apt.id}`,
  );
  return {
    status: "paid" as const,
    depositCents: apt.depositCents,
    checkoutUrl: null as string | null,
    provider: "console" as const,
  };
}

/** Internal — only call after Stripe session/webhook verification (or console pilot). */
export async function markDepositPaid(appointmentId: string) {
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!apt) throw notFound("Appointment not found");
  if (apt.depositStatus === DepositStatus.PAID) return apt;
  return withClinicTransaction(apt.clinicId, async (tx) => {
    return tx.appointment.update({
      where: { id: appointmentId },
      data: {
        depositStatus: DepositStatus.PAID,
        depositPaidAt: new Date(),
        status: AppointmentStatus.CONFIRMED,
      },
    });
  });
}

/**
 * Verify a Stripe Checkout session and mark the deposit paid.
 * Public success page calls this with session_id + manage token.
 * Response is minimal — no raw appointment row.
 */
export async function verifyStripeDepositSession(opts: {
  sessionId: string;
  token: string;
}) {
  const { appointmentId } = verifyManageToken(opts.token);
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw badRequest("STRIPE_SECRET_KEY is not configured");

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(opts.sessionId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error("Stripe session retrieve failed", text);
    throw badRequest("Could not verify payment session");
  }

  const session = (await res.json()) as {
    id: string;
    payment_status?: string;
    mode?: string;
    metadata?: { appointmentId?: string; clinicId?: string };
  };

  const metaApt = session.metadata?.appointmentId;
  if (!metaApt || metaApt !== appointmentId) {
    throw unauthorized("Session does not match this appointment");
  }
  if (session.mode && session.mode !== "payment") {
    throw badRequest("Unexpected checkout mode");
  }
  if (session.payment_status !== "paid") {
    const apt = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { depositCents: true, depositStatus: true },
    });
    return {
      status: "unpaid" as const,
      depositCents: apt.depositCents,
    };
  }

  const appointment = await markDepositPaid(appointmentId);
  return {
    status: "paid" as const,
    depositCents: appointment.depositCents,
  };
}

/** Apply deposit paid from Stripe webhook checkout.session.completed */
export async function applyDepositCheckoutCompleted(session: {
  id?: string;
  mode?: string;
  payment_status?: string;
  metadata?: { appointmentId?: string; clinicId?: string };
}) {
  if (session.mode !== "payment") return { applied: false as const };
  if (session.payment_status !== "paid") return { applied: false as const };
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) return { applied: false as const };
  const appointment = await markDepositPaid(appointmentId);
  return { applied: true as const, appointmentId: appointment.id };
}

export async function waiveDeposit(
  clinicId: string,
  appointmentId: string,
) {
  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
  });
  if (!apt) throw notFound("Appointment not found");
  return withClinicTransaction(clinicId, async (tx) => {
    return tx.appointment.update({
      where: { id: apt.id },
      data: {
        depositStatus: DepositStatus.WAIVED,
        depositPaidAt: null,
      },
    });
  });
}
