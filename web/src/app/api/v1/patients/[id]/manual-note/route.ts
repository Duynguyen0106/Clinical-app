import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanMutateClinical } from "@/server/rbac";
import { createPatientManualDraft } from "@/modules/notes/service";
import { z } from "zod";

const bodySchema = z
  .object({
    templateId: z.string().min(1).optional(),
  })
  .optional();

export const POST = withAuth(async (req, ctx, params) => {
  assertCanMutateClinical(ctx);
  const body = bodySchema.parse(
    req.headers.get("content-type")?.includes("application/json")
      ? await req.json().catch(() => ({}))
      : {},
  );
  const note = await createPatientManualDraft(ctx, {
    patientId: params.id,
    templateId: body?.templateId,
  });
  return jsonOk({
    note: {
      id: note.id,
      status: note.status,
      source: note.source,
      visitId: note.visitId,
      content: note.content,
      updatedAt: note.updatedAt,
      template: note.template ?? null,
    },
  });
});
