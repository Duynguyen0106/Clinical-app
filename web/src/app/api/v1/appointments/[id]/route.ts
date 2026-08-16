import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanMutateClinical } from "@/server/rbac";
import {
  getAppointment,
  rescheduleAppointment,
  rescheduleSchema,
  updateAppointmentStatus,
  updateAppointmentStatusSchema,
} from "@/modules/scheduling/service";

export const GET = withAuth(async (_req, ctx, params) => {
  const appointment = await getAppointment(ctx, params.id);
  return jsonOk({ appointment });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  assertCanMutateClinical(ctx);
  const body = await req.json();
  if ("startsAt" in body) {
    const parsed = rescheduleSchema.parse(body);
    const appointment = await rescheduleAppointment(
      ctx,
      params.id,
      parsed.startsAt,
    );
    return jsonOk({ appointment });
  }
  const parsed = updateAppointmentStatusSchema.parse(body);
  const appointment = await updateAppointmentStatus(
    ctx,
    params.id,
    parsed.status,
  );
  return jsonOk({ appointment });
});
