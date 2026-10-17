import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  assertOwnsDiaryOrOwner,
  requireOwnerOrReception,
  requireStaff,
} from "@/server/rbac";
import {
  ensureInvoiceForVisit,
  markInvoicePaid,
  markPaidSchema,
} from "@/modules/billing/service";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";

async function loadVisitDiary(clinicId: string, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      appointment: { clinicId },
    },
    select: {
      id: true,
      appointment: { select: { practitionerId: true } },
    },
  });
  if (!visit) throw notFound("Visit not found");
  return visit;
}

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const visit = await loadVisitDiary(ctx.clinicId, params.id);
  assertOwnsDiaryOrOwner(ctx, visit.appointment.practitionerId);
  const invoice = await ensureInvoiceForVisit(ctx, params.id);
  return jsonOk({ invoice });
});

/** End-of-visit mark paid — front desk / owner only */
export const POST = withAuth(async (req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const visit = await loadVisitDiary(ctx.clinicId, params.id);
  // Reception/owner may mark paid for any clinic diary
  void visit;
  const invoice = await ensureInvoiceForVisit(ctx, params.id);
  const body = markPaidSchema.parse(await req.json().catch(() => ({})));
  const paid = await markInvoicePaid(ctx, invoice.id, body);
  return jsonOk({ invoice: paid });
});
