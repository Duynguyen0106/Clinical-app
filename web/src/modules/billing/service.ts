import { z } from "zod";
import { InvoiceStatus } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import { requirePatient } from "@/modules/patients/service";
import { clinicLogoDataUrl } from "@/modules/clinic/profile";

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

export async function getInvoice(ctx: AuthContext, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      payments: { orderBy: { paidAt: "desc" } },
      appointment: {
        include: {
          appointmentType: { select: { name: true } },
          practitioner: { select: { displayName: true } },
        },
      },
    },
  });
  if (!invoice) throw notFound("Invoice not found");
  return invoice;
}

/**
 * Ensure a SENT/PAID invoice exists for an appointment (uses type default price).
 * Idempotent — returns the existing linked invoice when present.
 */
export async function ensureInvoiceForAppointment(
  ctx: AuthContext,
  appointmentId: string,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
    include: {
      appointmentType: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!appointment) throw notFound("Appointment not found");

  const existing = await prisma.invoice.findFirst({
    where: {
      clinicId: ctx.clinicId,
      appointmentId: appointment.id,
      status: { not: InvoiceStatus.VOID },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const amountCents = appointment.appointmentType.defaultPriceCents;
  if (!amountCents || amountCents <= 0) {
    throw badRequest(
      "No fee on this appointment type — set a default price or create an invoice on Money",
    );
  }

  return prisma.invoice.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      amountCents,
      currency: "GBP",
      status: InvoiceStatus.SENT,
      issuedAt: new Date(),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      payments: true,
    },
  });
}

export async function ensureInvoiceForVisit(ctx: AuthContext, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      appointment: { clinicId: ctx.clinicId },
    },
    select: { appointmentId: true },
  });
  if (!visit) throw notFound("Visit not found");
  return ensureInvoiceForAppointment(ctx, visit.appointmentId);
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

export type ReceiptDocument = {
  kind: "receipt";
  invoiceId: string;
  reference: string;
  clinic: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    brandColour: string | null;
    logoDataUrl: string | null;
  };
  patient: { fullName: string; email: string | null; phone: string | null };
  serviceName: string | null;
  practitionerName: string | null;
  appointmentStartsAt: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  payments: Array<{
    amountCents: number;
    method: string;
    paidAt: string;
  }>;
  printedAt: string;
};

export async function buildReceiptDocument(
  ctx: AuthContext,
  invoiceId: string,
): Promise<ReceiptDocument> {
  const invoice = await getInvoice(ctx, invoiceId);
  const clinic = await prisma.clinic.findFirstOrThrow({
    where: { id: ctx.clinicId },
  });
  const logoDataUrl = await clinicLogoDataUrl(clinic.id);
  const ref = `INV-${invoice.id.slice(-8).toUpperCase()}`;

  return {
    kind: "receipt",
    invoiceId: invoice.id,
    reference: ref,
    clinic: {
      name: clinic.name,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
      brandColour: clinic.brandColour,
      logoDataUrl,
    },
    patient: {
      fullName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      email: invoice.patient.email,
      phone: invoice.patient.phone,
    },
    serviceName: invoice.appointment?.appointmentType.name ?? null,
    practitionerName: invoice.appointment?.practitioner.displayName ?? null,
    appointmentStartsAt: invoice.appointment?.startsAt?.toISOString() ?? null,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    status: invoice.status,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    payments: invoice.payments.map((p) => ({
      amountCents: p.amountCents,
      method: p.method,
      paidAt: p.paidAt.toISOString(),
    })),
    printedAt: new Date().toISOString(),
  };
}
