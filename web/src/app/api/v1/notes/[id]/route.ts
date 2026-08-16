import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getNote,
  updateDraftNote,
  updateNoteSchema,
} from "@/modules/notes/service";

export const GET = withAuth(async (_req, ctx, params) => {
  const note = await getNote(ctx, params.id);
  return jsonOk({ note });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  const body = updateNoteSchema.parse(await req.json());
  const note = await updateDraftNote(ctx, params.id, body.content);
  return jsonOk({ note });
});
