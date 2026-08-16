import { withAuth } from "@/server/api";
import { jsonCreated } from "@/server/http";
import { requireClinician } from "@/server/rbac";
import { addendumSchema, createAddendumDraft } from "@/modules/notes/service";

export const POST = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const body = addendumSchema.parse(await req.json());
  const note = await createAddendumDraft(ctx, params.id, body);
  return jsonCreated({ note });
});
