import { NoteStatus } from "@/generated/prisma/client";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { listNotes, listNoteTemplates } from "@/modules/notes/service";

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  if (url.searchParams.get("templates") === "1") {
    const templates = await listNoteTemplates(ctx);
    return jsonOk({ templates });
  }
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && Object.values(NoteStatus).includes(statusParam as NoteStatus)
      ? (statusParam as NoteStatus)
      : undefined;
  const notes = await listNotes(ctx, { status });
  return jsonOk({ notes });
});
