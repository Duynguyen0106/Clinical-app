/**
 * Deposit payments — PAYMENT_PROVIDER=console|stripe
 * Console marks deposits paid immediately (pilot / demo).
 * Stripe returns a Checkout URL when configured.
 */
import { DepositStatus, AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";

export function getPaymentProvider() {
  return (process.env.PAYMENT_PROVIDER ?? "console").toLowerCase();
}

export async function createDepositCheckout(appointmentId: string) {
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
  const successUrl = `${getAppBaseUrl()}/book/manage/deposit-success?appointmentId=${apt.id}`;
  const cancelUrl = `${getAppBaseUrl()}/book/${apt.clinic.slug}`;

  if (provider === "stripe") {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) {
      throw badRequest("STRIPE_SECRET_KEY is not configured");
    }
    // Minimal Checkout Session via Stripe API (no SDK dependency)
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

  // Console / pilot: treat as paid immediately
  await prisma.appointment.update({
    where: { id: apt.id },
    data: {
      depositStatus: DepositStatus.PAID,
      depositPaidAt: new Date(),
      status: AppointmentStatus.CONFIRMED,
    },
  });
  console.info(
    `[payments:console] deposit £${pounds} marked PAID for apt=${apt.id} (${apt.patient.email})`,
  );
  return {
    status: "paid" as const,
    depositCents: apt.depositCents,
    checkoutUrl: null as string | null,
    provider: "console" as const,
  };
}

export async function markDepositPaid(appointmentId: string) {
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!apt) throw notFound("Appointment not found");
  if (apt.depositStatus === DepositStatus.PAID) return apt;
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      depositStatus: DepositStatus.PAID,
      depositPaidAt: new Date(),
      status: AppointmentStatus.CONFIRMED,
    },
  });
}

export async function waiveDeposit(
  clinicId: string,
  appointmentId: string,
) {
  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
  });
  if (!apt) throw notFound("Appointment not found");
  return prisma.appointment.update({
    where: { id: apt.id },
    data: {
      depositStatus: DepositStatus.WAIVED,
      depositPaidAt: null,
    },
  });
}
