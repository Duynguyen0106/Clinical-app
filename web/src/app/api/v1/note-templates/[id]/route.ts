import { withAuth } from "@/server/api";
import { requireRole } from "@/server/auth";
import { jsonOk } from "@/server/http";
import {
  deleteNoteTemplate,
  noteTemplateUpsertSchema,
  updateNoteTemplate,
} from "@/modules/notes/service";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireRole(ctx, ["OWNER"]);
  const body = noteTemplateUpsertSchema.parse(await req.json());
  const template = await updateNoteTemplate(ctx, params.id, body);
  return jsonOk({ template });
});

export const DELETE = withAuth(async (_req, ctx, params) => {
  requireRole(ctx, ["OWNER"]);
  const result = await deleteNoteTemplate(ctx, params.id);
  return jsonOk(result);
});
