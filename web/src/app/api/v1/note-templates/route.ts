import { withAuth } from "@/server/api";
import { requireRole } from "@/server/auth";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  createNoteTemplate,
  listNoteTemplates,
  noteTemplateUpsertSchema,
} from "@/modules/notes/service";
import { requireClinician } from "@/server/rbac";

export const GET = withAuth(async (_req, ctx) => {
  requireClinician(ctx);
  const templates = await listNoteTemplates(ctx);
  return jsonOk({ templates });
});

export const POST = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = noteTemplateUpsertSchema.parse(await req.json());
  const template = await createNoteTemplate(ctx, body);
  return jsonCreated({ template });
});
