import type { AuthContext } from "@/server/auth";
import { NoteStatus } from "@/generated/prisma/client";
import { notFound } from "@/server/errors";
import { assertOwnsDiaryOrOwner } from "@/server/rbac";
import { withClinicTransaction } from "@/server/clinic-rls";

/**
 * Need-to-know for clinical notes: owners any diary; practitioners own diary
 * visits; visit-less drafts stay with the creator; signed/voided visit-less
 * notes are visible to practitioners who share the patient on their diary.
 */
export async function assertNoteDiaryAccess(ctx: AuthContext, noteId: string) {
  const note = await withClinicTransaction(ctx.clinicId, async (tx) => {
    return tx.clinicalNote.findFirst({
      where: { id: noteId, patient: { clinicId: ctx.clinicId } },
      select: {
        status: true,
        patientId: true,
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

  // Visit-less: creator or signer
  if (note.signedById && note.signedById === ctx.userId) return;
  const createdBy = note.audits[0]?.actorId;
  if (createdBy && createdBy === ctx.userId) return;

  // Signed/voided standalone notes: any practitioner with this patient on diary
  if (
    (note.status === NoteStatus.SIGNED || note.status === NoteStatus.VOIDED) &&
    ctx.role === "PRACTITIONER" &&
    ctx.practitionerProfileId
  ) {
    const onDiary = await withClinicTransaction(ctx.clinicId, async (tx) => {
      return tx.appointment.findFirst({
        where: {
          clinicId: ctx.clinicId,
          patientId: note.patientId,
          practitionerId: ctx.practitionerProfileId!,
        },
        select: { id: true },
      });
    });
    if (onDiary) return;
  }

  throw notFound("Note not found");
}
