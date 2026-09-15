import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireOwnerOrReception } from "@/server/rbac";
import {
  updateAppointmentType,
  updateAppointmentTypeSchema,
} from "@/modules/scheduling/appointment-types";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const body = updateAppointmentTypeSchema.parse(await req.json());
  const appointmentType = await updateAppointmentType(ctx, params.id, body);
  return jsonOk({ appointmentType });
});
