import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatient,
  getPatientPrep,
  updatePatient,
  updatePatientSchema,
} from "@/modules/patients/service";

export const GET = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  if (url.searchParams.get("prep") === "1") {
    const prep = await getPatientPrep(ctx, params.id);
    return jsonOk({ prep });
  }
  const patient = await getPatient(ctx, params.id);
  return jsonOk({ patient });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = updatePatientSchema.parse(await req.json());
  const patient = await updatePatient(ctx, params.id, body);
  return jsonOk({ patient });
});
