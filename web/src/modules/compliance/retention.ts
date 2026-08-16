import { prisma } from "@/server/db";
import { deleteAudioByStorageKey } from "@/server/storage";
import { RecordingStatus } from "@/generated/prisma/client";

/**
 * Delete encrypted audio blobs past clinic retention, and clear storageKey.
 * Transcripts/notes remain — only raw audio is purged.
 */
export async function runAudioRetention(clinicId?: string) {
  const clinics = await prisma.clinic.findMany({
    where: clinicId ? { id: clinicId } : undefined,
    select: { id: true, audioRetentionDays: true, name: true },
  });

  let deleted = 0;
  const details: { clinicId: string; recordingId: string }[] = [];

  for (const clinic of clinics) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.max(0, clinic.audioRetentionDays));

    const recordings = await prisma.recording.findMany({
      where: {
        storageKey: { not: null },
        createdAt: { lte: cutoff },
        visit: { appointment: { clinicId: clinic.id } },
        status: {
          in: [
            RecordingStatus.READY,
            RecordingStatus.FAILED,
            RecordingStatus.UPLOADING,
          ],
        },
      },
      select: { id: true, storageKey: true },
      take: 200,
    });

    for (const rec of recordings) {
      if (!rec.storageKey) continue;
      await deleteAudioByStorageKey(rec.storageKey);
      await prisma.recording.update({
        where: { id: rec.id },
        data: {
          storageKey: null,
          error: rec.storageKey
            ? `Audio purged after ${clinic.audioRetentionDays}d retention`
            : undefined,
        },
      });
      deleted += 1;
      details.push({ clinicId: clinic.id, recordingId: rec.id });
    }
  }

  return { deleted, details };
}
