import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { requireStaff } from "@/server/rbac";
import {
  createPractitioner,
  createPractitionerSchema,
  listTeam,
} from "@/modules/team/service";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const practitioners = await listTeam(ctx);
  return jsonOk({ practitioners });
});

export const POST = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = createPractitionerSchema.parse(await req.json());
  const practitioner = await createPractitioner(ctx, body);
  return jsonCreated({ practitioner });
});
