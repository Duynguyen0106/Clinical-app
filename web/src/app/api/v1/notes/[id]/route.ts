import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getNote,
  updateDraftNote,
  updateNoteSchema,
} from "@/modules/notes/service";
import { requireClinician } from "@/server/rbac";
import { requireStaff } from "@/server/rbac";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const note = await getNote(ctx, params.id);
  return jsonOk({ note });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const body = updateNoteSchema.parse(await req.json());
  const note = await updateDraftNote(ctx, params.id, body.content);
  return jsonOk({ note });
});
