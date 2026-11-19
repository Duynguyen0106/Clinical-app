import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanMutateClinical } from "@/server/rbac";
import { createManualDraft } from "@/modules/notes/service";
import { getVisit } from "@/modules/visits/service";
import { z } from "zod";

const bodySchema = z
  .object({
    templateId: z.string().min(1).optional(),
  })
  .optional();

export const POST = withAuth(async (req, ctx, params) => {
  assertCanMutateClinical(ctx);
  const visit = await getVisit(ctx, params.id);
  const body = bodySchema.parse(
    req.headers.get("content-type")?.includes("application/json")
      ? await req.json().catch(() => ({}))
      : {},
  );
  const note = await createManualDraft(ctx, {
    visitId: visit.id,
    patientId: visit.appointment.patientId,
    templateId: body?.templateId,
  });
  return jsonOk({
    note: {
      id: note.id,
      status: note.status,
      source: note.source,
      content: note.content,
      updatedAt: note.updatedAt,
      template: note.template ?? null,
    },
  });
});
