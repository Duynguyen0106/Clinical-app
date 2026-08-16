import { AiJobStatus, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import {
  stopRecordingAndOrganise,
  stopRecordingSchema,
} from "@/modules/visits/service";
import { z } from "zod";

export { organiseAsyncEnabled } from "@/modules/visits/organise-flags";

const jobPayloadSchema = z.object({
  durationSec: z.number().int().positive().optional(),
  transcriptText: z.string().optional(),
  templateId: z.string().optional(),
  role: z.enum(["OWNER", "PRACTITIONER", "RECEPTION", "READ_ONLY"]),
  membershipId: z.string(),
  practitionerProfileId: z.string().nullable(),
  email: z.string(),
  name: z.string(),
});

export type OrganiseJobPayload = z.infer<typeof jobPayloadSchema>;

export async function enqueueOrganiseJob(
  ctx: AuthContext,
  visitId: string,
  input: z.infer<typeof stopRecordingSchema> = {},
) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      appointment: { clinicId: ctx.clinicId },
    },
    include: {
      recording: true,
      notes: { select: { status: true } },
    },
  });
  if (!visit) throw notFound("Visit not found");
  if (!visit.recording) throw badRequest("No active recording");
  if (!visit.recordingConsentAt) {
    throw badRequest("Recording consent required");
  }
  if (visit.notes.some((n) => n.status === "SIGNED")) {
    throw badRequest("Visit already has a signed note");
  }
  if (!visit.recording.storageKey) {
    throw badRequest("Upload audio before organising");
  }

  const payload: OrganiseJobPayload = {
    durationSec: input.durationSec,
    transcriptText: input.transcriptText,
    templateId: input.templateId,
    role: ctx.role,
    membershipId: ctx.membershipId,
    practitionerProfileId: ctx.practitionerProfileId,
    email: ctx.email,
    name: ctx.name,
  };

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: {
      status: "TRANSCRIBING",
      durationSec: input.durationSec ?? visit.recording.durationSec,
      error: null,
    },
  });

  // Collapse prior pending jobs for this visit
  await prisma.aiOrganiseJob.updateMany({
    where: {
      visitId,
      status: { in: [AiJobStatus.PENDING, AiJobStatus.RUNNING] },
    },
    data: {
      status: AiJobStatus.FAILED,
      error: "Superseded by newer organise request",
      finishedAt: new Date(),
    },
  });

  const job = await prisma.aiOrganiseJob.create({
    data: {
      visitId,
      clinicId: ctx.clinicId,
      actorUserId: ctx.userId,
      status: AiJobStatus.PENDING,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });

  return job;
}

export async function processOrganiseJob(jobId: string) {
  const claimed = await prisma.aiOrganiseJob.updateMany({
    where: {
      id: jobId,
      status: AiJobStatus.PENDING,
      attempts: { lt: 3 },
    },
    data: {
      status: AiJobStatus.RUNNING,
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });

  if (claimed.count === 0) {
    return { ok: false as const, reason: "not_claimable" };
  }

  const job = await prisma.aiOrganiseJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  const parsed = jobPayloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    await failJob(job.id, "Invalid job payload");
    return { ok: false as const, reason: "bad_payload" };
  }

  const ctx: AuthContext = {
    userId: job.actorUserId,
    clinicId: job.clinicId,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
    membershipId: parsed.data.membershipId,
    practitionerProfileId: parsed.data.practitionerProfileId,
  };

  try {
    const result = await stopRecordingAndOrganise(ctx, job.visitId, {
      durationSec: parsed.data.durationSec,
      transcriptText: parsed.data.transcriptText,
      templateId: parsed.data.templateId,
    });
    await prisma.aiOrganiseJob.update({
      where: { id: job.id },
      data: {
        status: AiJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        error: null,
      },
    });
    return { ok: true as const, noteId: result.note.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Organise failed";
    await failJob(job.id, message);
    return { ok: false as const, reason: "organise_failed", message };
  }
}

async function failJob(jobId: string, error: string) {
  const job = await prisma.aiOrganiseJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const giveUp = job.attempts >= job.maxAttempts;
  await prisma.aiOrganiseJob.update({
    where: { id: jobId },
    data: {
      status: giveUp ? AiJobStatus.FAILED : AiJobStatus.PENDING,
      error,
      finishedAt: giveUp ? new Date() : null,
    },
  });
}

/** Drain a batch of pending organise jobs (cron / after()). */
export async function processPendingOrganiseJobs(limit = 5) {
  const pending = await prisma.aiOrganiseJob.findMany({
    where: {
      status: AiJobStatus.PENDING,
      attempts: { lt: 3 },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const job of pending) {
    results.push(await processOrganiseJob(job.id));
  }
  return { processed: results.length, results };
}
