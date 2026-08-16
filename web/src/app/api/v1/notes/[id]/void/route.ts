import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireClinician } from "@/server/rbac";
import { voidNoteSchema, voidSignedNote } from "@/modules/notes/service";

export const POST = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const body = voidNoteSchema.parse(await req.json());
  const note = await voidSignedNote(ctx, params.id, body);
  return jsonOk({ note });
});
