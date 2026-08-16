import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { signNote } from "@/modules/notes/service";
import { requireClinician } from "@/server/rbac";

export const POST = withAuth(async (_req, ctx, params) => {
  requireClinician(ctx);
  const note = await signNote(ctx, params.id);
  return jsonOk({ note });
});
