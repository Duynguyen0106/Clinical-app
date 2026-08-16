import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatient,
  updatePatient,
  updatePatientSchema,
} from "@/modules/patients/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const patient = await getPatient(ctx, params.id);
  return jsonOk({ patient });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = updatePatientSchema.parse(await req.json());
  const patient = await updatePatient(ctx, params.id, body);
  return jsonOk({ patient });
});
