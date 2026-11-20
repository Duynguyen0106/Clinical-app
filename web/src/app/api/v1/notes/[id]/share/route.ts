import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { assertCanMutateClinical } from "@/server/rbac";
import {
  shareNoteSchema,
  shareNoteWithPatient,
} from "@/modules/notes/share";

/**
 * POST /notes/:id/share
 * Email a patient copy of a signed note (clinic + practitioner letterhead).
 */
export const POST = withAuth(async (req, ctx, params) => {
  assertCanMutateClinical(ctx);
  const body = shareNoteSchema.parse(await req.json());
  const result = await shareNoteWithPatient(ctx, params.id, body);
  return jsonOk({ share: result });
});
