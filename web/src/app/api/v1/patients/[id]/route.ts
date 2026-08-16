import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getPatient,
  updatePatient,
  updatePatientSchema,
} from "@/modules/patients/service";

export const GET = withAuth(async (_req, ctx, params) => {
  const patient = await getPatient(ctx, params.id);
  return jsonOk({ patient });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  const body = updatePatientSchema.parse(await req.json());
  const patient = await updatePatient(ctx, params.id, body);
  return jsonOk({ patient });
});
