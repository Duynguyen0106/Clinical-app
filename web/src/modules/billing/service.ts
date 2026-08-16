import { z } from "zod";
import { InvoiceStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { requirePatient } from "@/modules/patients/service";

export const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional().nullable(),
  amountCents: z.number().int().positive(),
  currency: z.enum(["GBP"]).optional(),
});

export async function listInvoices(
  ctx: AuthContext,
  opts: { status?: InvoiceStatus } = {},
) {
  return prisma.invoice.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createInvoice(
  ctx: AuthContext,
  input: z.infer<typeof createInvoiceSchema>,
) {
  await requirePatient(ctx.clinicId, input.patientId);

  if (input.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        clinicId: ctx.clinicId,
        patientId: input.patientId,
      },
    });
    if (!apt) throw notFound("Appointment not found");
  }

  return prisma.invoice.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      amountCents: input.amountCents,
      currency: input.currency ?? "GBP",
      status: InvoiceStatus.SENT,
      issuedAt: new Date(),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      payments: true,
    },
  });
}

export const markPaidSchema = z.object({
  method: z
    .enum(["cash", "card_terminal", "bank_transfer", "other"])
    .default("card_terminal"),
  amountCents: z.number().int().positive().optional(),
});

export async function markInvoicePaid(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof markPaidSchema>,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!invoice) throw notFound("Invoice not found");
  if (invoice.status === InvoiceStatus.VOID) {
    throw badRequest("Cannot pay a void invoice");
  }
  if (invoice.status === InvoiceStatus.PAID) {
    return prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        payments: true,
      },
    });
  }

  const amount = input.amountCents ?? invoice.amountCents;

  return prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: amount,
        method: input.method,
      },
    });
    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        payments: true,
      },
    });
  });
}

export async function markInvoiceUnpaid(ctx: AuthContext, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: { payments: true },
  });
  if (!invoice) throw notFound("Invoice not found");
  if (invoice.status === InvoiceStatus.VOID) {
    throw badRequest("Cannot unpay a void invoice");
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { invoiceId: invoice.id } });
    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.SENT,
        paidAt: null,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        payments: true,
      },
    });
  });
}
