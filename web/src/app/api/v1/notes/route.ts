import { NoteStatus } from "@/generated/prisma/client";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { listNotes, listNoteTemplates } from "@/modules/notes/service";
import { requireClinician } from "@/server/rbac";

export const GET = withAuth(async (req, ctx) => {
  requireClinician(ctx);
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
  const practitionerId = url.searchParams.get("practitionerId") ?? undefined;
  // Practitioners default to their own diary notes unless they ask for clinic-wide
  const scopedPractitionerId =
    practitionerId ??
    (ctx.role === "PRACTITIONER" ? ctx.practitionerProfileId ?? undefined : undefined);
  const notes = await listNotes(ctx, {
    status,
    practitionerId: scopedPractitionerId ?? undefined,
  });
  return jsonOk({ notes });
});
