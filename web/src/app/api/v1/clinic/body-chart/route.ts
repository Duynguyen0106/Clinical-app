import { withAuth } from "@/server/api";
import { requireRole } from "@/server/auth";
import { jsonOk } from "@/server/http";
import { requireClinician } from "@/server/rbac";
import {
  deleteClinicCustomAnatomyView,
  getClinicBodyChartConfig,
  upsertClinicCustomAnatomyView,
  upsertCustomViewSchema,
} from "@/modules/clinic/body-chart";
import { badRequest } from "@/server/errors";

export const GET = withAuth(async (_req, ctx) => {
  requireClinician(ctx);
  const config = await getClinicBodyChartConfig(ctx);
  return jsonOk({ config });
});

export const POST = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = upsertCustomViewSchema.parse(await req.json());
  const config = await upsertClinicCustomAnatomyView(ctx, body);
  return jsonOk({ config });
});

export const DELETE = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw badRequest("id required");
  const config = await deleteClinicCustomAnatomyView(ctx, id);
  return jsonOk({ config });
});
