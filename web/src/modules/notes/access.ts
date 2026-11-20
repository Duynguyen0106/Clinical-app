import type { AuthContext } from "@/server/auth";
import { notFound } from "@/server/errors";
import { assertOwnsDiaryOrOwner } from "@/server/rbac";
import { withClinicTransaction } from "@/server/clinic-rls";

/**
 * Need-to-know for clinical notes: owners any diary; practitioners own diary
 * (or notes they created/signed when there is no visit link).
 */
export async function assertNoteDiaryAccess(ctx: AuthContext, noteId: string) {
  const note = await withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.clinicalNote.findFirst({
      where: { id: noteId, patient: { clinicId: ctx.clinicId } },
      select: {
        signedById: true,
        visitId: true,
        visit: {
          select: {
            appointment: { select: { practitionerId: true } },
          },
        },
        audits: {
          where: { action: "created" },
          select: { actorId: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
  });
  if (!note) throw notFound("Note not found");
  if (ctx.role === "OWNER") return;

  const diaryId = note.visit?.appointment.practitionerId;
  if (diaryId) {
    assertOwnsDiaryOrOwner(ctx, diaryId);
    return;
  }

  // Visit-less notes: creator or signer only (practitioners)
  if (note.signedById && note.signedById === ctx.userId) return;
  const createdBy = note.audits[0]?.actorId;
  if (createdBy && createdBy === ctx.userId) return;

  throw notFound("Note not found");
}
