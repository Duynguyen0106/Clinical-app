import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getClinicalDocument,
  getGpLetterDocument,
} from "@/modules/notes/documents";
import { badRequest } from "@/server/errors";

/**
 * GET /notes/:id/document?kind=clinical_note|gp_letter
 * Printable packs for signed notes (clinician only).
 */
export const GET = withAuth(async (req, ctx, params) => {
  const kind = new URL(req.url).searchParams.get("kind") ?? "clinical_note";
  if (kind === "gp_letter") {
    const document = await getGpLetterDocument(ctx, params.id);
    return jsonOk({ document });
  }
  if (kind === "clinical_note") {
    const document = await getClinicalDocument(ctx, params.id);
    return jsonOk({ document });
  }
  throw badRequest("kind must be clinical_note or gp_letter");
});
