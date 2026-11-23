import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { loadRebookPreview } from "@/modules/scheduling/rebook-token";
import { enforcePublicClinicGetLimits } from "@/server/abuse";

/** Prefill returning-patient book form from a sealed rebook token. */
export const GET = withPublic(async (req) => {
  await enforcePublicClinicGetLimits(req);
  const token = new URL(req.url).searchParams.get("token");
  if (!token?.trim()) throw badRequest("token required");
  const preview = await loadRebookPreview(token.trim());
  return jsonOk({ rebook: preview });
});
