import type { AuthContext } from "@/server/auth";
import { notFound } from "@/server/errors";
import { assertOwnsDiaryOrOwner } from "@/server/rbac";
import { withClinicTransaction } from "@/server/clinic-rls";

/**
 * Need-to-know for clinical notes: owners any diary; practitioners own diary
 * (or notes they signed when there is no visit link).
 */
export async function assertNoteDiaryAccess(ctx: AuthContext, noteId: string) {
  const note = await withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.clinicalNote.findFirst({
      where: { id: noteId, patient: { clinicId: ctx.clinicId } },
      select: {
        signedById: true,
        visit: {
          select: {
            appointment: { select: { practitionerId: true } },
          },
        },
      },
    });
  });
  if (!note) throw notFound("Note not found");
  const diaryId = note.visit?.appointment.practitionerId;
  if (ctx.role === "OWNER") return;
  if (diaryId) {
    assertOwnsDiaryOrOwner(ctx, diaryId);
    return;
  }
  if (note.signedById && note.signedById === ctx.userId) return;
  throw notFound("Note not found");
}
