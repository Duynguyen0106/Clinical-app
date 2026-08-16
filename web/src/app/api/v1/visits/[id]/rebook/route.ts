import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireClinician } from "@/server/rbac";
import {
  bookFollowUp,
  rebookSchema,
  suggestRebook,
} from "@/modules/scheduling/rebook";

export const GET = withAuth(async (_req, ctx, params) => {
  requireClinician(ctx);
  const suggestion = await suggestRebook(ctx, params.id);
  return jsonOk({ suggestion });
});

export const POST = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const body = rebookSchema.parse(await req.json());
  const appointment = await bookFollowUp(ctx, params.id, body);
  return jsonCreated({ appointment });
});
