import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  assertCanManageSchedule,
  requireOwnerOrReception,
  requireStaff,
} from "@/server/rbac";
import {
  getAppointment,
  updateAppointment,
  updateAppointmentSchema,
} from "@/modules/scheduling/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const appointment = await getAppointment(ctx, params.id);
  return jsonOk({ appointment });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json();
  const parsed = updateAppointmentSchema.parse(body);
  if (
    parsed.startsAt !== undefined ||
    parsed.durationMinutes !== undefined ||
    parsed.appointmentTypeId !== undefined ||
    parsed.status === "CANCELLED" ||
    parsed.status === "NO_SHOW"
  ) {
    assertCanManageSchedule(ctx);
  } else if (parsed.additionalFeeCents !== undefined) {
    requireOwnerOrReception(ctx);
  } else {
    requireStaff(ctx);
  }
  const appointment = await updateAppointment(ctx, params.id, parsed);
  return jsonOk({ appointment });
});
