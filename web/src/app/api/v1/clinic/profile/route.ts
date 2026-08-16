import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getClinicProfile,
  updateClinicProfile,
  updateClinicProfileSchema,
} from "@/modules/clinic/profile";
import { requireStaff } from "@/server/rbac";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const clinic = await getClinicProfile(ctx);
  return jsonOk({ clinic });
});

export const PATCH = withAuth(async (req, ctx) => {
  const body = updateClinicProfileSchema.parse(await req.json());
  const clinic = await updateClinicProfile(ctx, body);
  return jsonOk({ clinic });
});
