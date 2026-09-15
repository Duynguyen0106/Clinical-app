import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireOwnerOrReception, requireStaff } from "@/server/rbac";
import {
  createAppointmentType,
  createAppointmentTypeSchema,
  listAppointmentTypesForClinic,
} from "@/modules/scheduling/appointment-types";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const appointmentTypes = await listAppointmentTypesForClinic(ctx);
  return jsonOk({ appointmentTypes });
});

export const POST = withAuth(async (req, ctx) => {
  requireOwnerOrReception(ctx);
  const body = createAppointmentTypeSchema.parse(await req.json());
  const appointmentType = await createAppointmentType(ctx, body);
  return jsonCreated({ appointmentType });
});
