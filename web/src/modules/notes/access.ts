import type { AuthContext } from "@/server/auth";
import { NoteStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { assertOwnsDiaryOrOwner } from "@/server/rbac";

/**
 * Need-to-know for clinical notes: owners any diary; practitioners own diary
 * visits; visit-less drafts stay with the creator; signed/voided visit-less
 * notes are visible to practitioners who share the patient on their diary.
 *
 * Bare prisma reads (no interactive Neon tx) — Worker `neondb_owner` bypasses
 * RLS; clinicId filters stay app-layer. Interactive txs here burned WS slots
 * under desk/calendar fan-out and surfaced as Cloudflare 1101.
 */
export async function assertNoteDiaryAccess(ctx: AuthContext, noteId: string) {
  const note = await prisma.clinicalNote.findFirst({
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
    const onDiary = await prisma.appointment.findFirst({
      where: {
        clinicId: ctx.clinicId,
        patientId: note.patientId,
        practitionerId: ctx.practitionerProfileId,
      },
      select: { id: true },
    });
    if (onDiary) return;
  }

  throw notFound("Note not found");
}
