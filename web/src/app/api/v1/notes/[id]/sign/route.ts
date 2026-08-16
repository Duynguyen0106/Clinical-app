import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { signNote } from "@/modules/notes/service";

export const POST = withAuth(async (_req, ctx, params) => {
  const note = await signNote(ctx, params.id);
  return jsonOk({ note });
});
