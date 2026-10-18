import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { requireOwnerOrReception } from "@/server/rbac";
import {
  staffConfirmDepositPaid,
  waiveDeposit,
} from "@/modules/billing/deposits";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["mark_paid", "waive"]),
});

export const POST = withAuth(async (req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  if (body.action === "mark_paid") {
    const appointment = await staffConfirmDepositPaid(ctx.clinicId, params.id);
    return jsonOk({
      appointment: {
        id: appointment.id,
        depositStatus: appointment.depositStatus,
        depositCents: appointment.depositCents,
        depositPaidAt: appointment.depositPaidAt,
        status: appointment.status,
      },
    });
  }
  if (body.action === "waive") {
    const appointment = await waiveDeposit(ctx.clinicId, params.id);
    return jsonOk({
      appointment: {
        id: appointment.id,
        depositStatus: appointment.depositStatus,
        depositCents: appointment.depositCents,
        depositPaidAt: appointment.depositPaidAt,
        status: appointment.status,
      },
    });
  }
  throw badRequest("Unknown deposit action");
});
