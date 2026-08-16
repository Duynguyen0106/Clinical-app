import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  createPatient,
  createPatientSchema,
  listPatients,
  parseListQuery,
} from "@/modules/patients/service";
import { requireStaff } from "@/server/rbac";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const { q, take } = parseListQuery(new URL(req.url));
  const patients = await listPatients(ctx, { q, take });
  return jsonOk({ patients });
});

export const POST = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const body = createPatientSchema.parse(await req.json());
  const patient = await createPatient(ctx, body);
  return jsonCreated({ patient });
});
