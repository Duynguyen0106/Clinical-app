import { z } from "zod";
import {
  AppointmentStatus,
  RecordingStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";
import { organiseNote, transcribeAudio } from "@/modules/ai/providers";
import { createDraftFromAi } from "@/modules/notes/service";
import type { NoteSection } from "@/modules/notes/templates";
import { saveAudioUpload, readAudioFile } from "@/server/storage";

export async function startVisit(ctx: AuthContext, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
    include: { visit: true, patient: true, appointmentType: true },
  });
  if (!appointment) throw notFound("Appointment not found");

  if (appointment.visit) {
    return prisma.visit.findUniqueOrThrow({
      where: { id: appointment.visit.id },
      include: {
        appointment: {
          include: { patient: true, appointmentType: true, practitioner: true },
        },
        recording: { include: { transcript: true } },
        notes: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.IN_PROGRESS },
    });
    return tx.visit.create({
      data: { appointmentId: appointment.id },
      include: {
        appointment: {
          include: { patient: true, appointmentType: true, practitioner: true },
        },
        recording: { include: { transcript: true } },
        notes: true,
      },
    });
  });
}

export async function getVisit(ctx: AuthContext, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      appointment: { clinicId: ctx.clinicId },
    },
    include: {
      appointment: {
        include: { patient: true, appointmentType: true, practitioner: true },
      },
      recording: { include: { transcript: true } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!visit) throw notFound("Visit not found");
  return visit;
}

export const consentRecordingSchema = z.object({
  granted: z.literal(true),
  method: z.enum(["in_person", "online_form", "verbal"]).default("in_person"),
});

export async function captureRecordingConsent(
  ctx: AuthContext,
  visitId: string,
  input: z.infer<typeof consentRecordingSchema>,
) {
  const visit = await getVisit(ctx, visitId);
  if (!input.granted) throw badRequest("Recording consent must be granted");

  const now = new Date();

  await prisma.$transaction([
    prisma.visit.update({
      where: { id: visit.id },
      data: { recordingConsentAt: now },
    }),
    prisma.patientConsent.create({
      data: {
        patientId: visit.appointment.patientId,
        type: "RECORDING",
        granted: true,
        method: input.method,
        meta: { visitId: visit.id },
      },
    }),
  ]);

  return getVisit(ctx, visitId);
}

export async function startRecording(ctx: AuthContext, visitId: string) {
  const visit = await getVisit(ctx, visitId);
  if (!visit.recordingConsentAt) {
    throw badRequest("Recording consent required before starting");
  }

  if (visit.recording) {
    // Allow a fresh take after a failed organise (audio may be replaced on upload)
    if (
      visit.recording.status === RecordingStatus.FAILED ||
      visit.recording.status === RecordingStatus.READY
    ) {
      const hasSigned = visit.notes.some((n) => n.status === "SIGNED");
      if (hasSigned) {
        throw badRequest("Visit already has a signed note");
      }
      return prisma.recording.update({
        where: { id: visit.recording.id },
        data: {
          status: RecordingStatus.RECORDING,
          error: null,
          durationSec: null,
        },
      });
    }
    return visit.recording;
  }

  return prisma.recording.create({
    data: {
      visitId: visit.id,
      status: RecordingStatus.RECORDING,
      storageKey: `clinics/${ctx.clinicId}/visits/${visit.id}/audio.webm`,
    },
  });
}

export async function uploadRecordingAudio(
  ctx: AuthContext,
  visitId: string,
  bytes: Buffer,
  opts: { extension?: string } = {},
) {
  const visit = await getVisit(ctx, visitId);
  if (!visit.recording) throw badRequest("Start recording first");
  if (!visit.recordingConsentAt) {
    throw badRequest("Recording consent required");
  }

  const storageKey = await saveAudioUpload(ctx.clinicId, visit.id, bytes, {
    extension: opts.extension,
  });

  return prisma.recording.update({
    where: { id: visit.recording.id },
    data: {
      storageKey,
      status: RecordingStatus.UPLOADING,
      error: null,
    },
  });
}

export const stopRecordingSchema = z.object({
  durationSec: z.number().int().positive().optional(),
  transcriptText: z.string().optional(),
  templateId: z.string().optional(),
});

/**
 * Stop recording → STT → template-aware organise → draft note.
 * Safe to retry when status is FAILED / UPLOADING if audio is on disk.
 */
export async function stopRecordingAndOrganise(
  ctx: AuthContext,
  visitId: string,
  input: z.infer<typeof stopRecordingSchema> = {},
) {
  const visit = await getVisit(ctx, visitId);
  if (!visit.recording) throw badRequest("No active recording");
  if (!visit.recordingConsentAt) {
    throw badRequest("Recording consent required");
  }

  const hasSigned = visit.notes.some((n) => n.status === "SIGNED");
  if (hasSigned) {
    throw badRequest("Visit already has a signed note");
  }

  if (!visit.recording.storageKey) {
    throw badRequest("Upload audio before organising");
  }

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: {
      status: RecordingStatus.TRANSCRIBING,
      durationSec: input.durationSec ?? visit.recording.durationSec,
      error: null,
    },
  });

  let audioBytes: Buffer | undefined;
  try {
    if (visit.recording.storageKey) {
      audioBytes = await readAudioFile(visit.recording.storageKey);
    }
  } catch {
    audioBytes = undefined;
  }

  let transcriptText = input.transcriptText;
  try {
    transcriptText =
      transcriptText ??
      (await transcribeAudio({
        storageKey: visit.recording.storageKey ?? visit.id,
        audioBytes,
      }));
  } catch (err) {
    await prisma.recording.update({
      where: { id: visit.recording.id },
      data: {
        status: RecordingStatus.FAILED,
        error: err instanceof Error ? err.message : "Transcription failed",
      },
    });
    throw err;
  }

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: { status: RecordingStatus.ORGANISING },
  });

  const transcript = await prisma.transcript.upsert({
    where: { recordingId: visit.recording.id },
    create: {
      recordingId: visit.recording.id,
      text: transcriptText,
    },
    update: { text: transcriptText },
  });

  const template = await resolveTemplate(
    ctx.clinicId,
    visit.appointment.appointmentType.name,
    input.templateId,
  );

  const sections = extractSections(template?.schema);
  const patientName = `${visit.appointment.patient.firstName} ${visit.appointment.patient.lastName}`;

  let organised;
  try {
    organised = await organiseNote({
      transcript: transcriptText,
      patientName,
      appointmentType: visit.appointment.appointmentType.name,
      sections,
    });
  } catch (err) {
    await prisma.recording.update({
      where: { id: visit.recording.id },
      data: {
        status: RecordingStatus.FAILED,
        error: err instanceof Error ? err.message : "Organise failed",
      },
    });
    throw err;
  }

  const note = await createDraftFromAi(ctx, {
    patientId: visit.appointment.patientId,
    visitId: visit.id,
    content: organised,
    templateId: template?.id,
  });

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: { status: RecordingStatus.READY, error: null },
  });

  await prisma.visit.update({
    where: { id: visit.id },
    data: { endedAt: new Date() },
  });

  await prisma.appointment.update({
    where: { id: visit.appointmentId },
    data: { status: AppointmentStatus.COMPLETED },
  });

  return {
    visit: await getVisit(ctx, visitId),
    transcript,
    note,
    template,
  };
}

async function resolveTemplate(
  clinicId: string,
  appointmentTypeName: string,
  templateId?: string,
) {
  if (templateId) {
    return prisma.noteTemplate.findFirst({
      where: { id: templateId, clinicId },
    });
  }

  const all = await prisma.noteTemplate.findMany({ where: { clinicId } });
  const lower = appointmentTypeName.toLowerCase();
  const matched =
    all.find((t) => lower.includes("osteo") && t.name.toLowerCase().includes("osteo")) ??
    all.find(
      (t) =>
        lower.includes("manual") && t.name.toLowerCase().includes("manual"),
    ) ??
    all.find(
      (t) =>
        lower.includes("initial") && t.name.toLowerCase().includes("initial"),
    ) ??
    all.find(
      (t) =>
        lower.includes("review") && t.name.toLowerCase().includes("review"),
    ) ??
    all.find((t) => t.isDefault) ??
    all[0];

  return matched ?? null;
}

function extractSections(schema: unknown): NoteSection[] {
  if (
    schema &&
    typeof schema === "object" &&
    Array.isArray((schema as { sections?: unknown }).sections)
  ) {
    return (schema as { sections: NoteSection[] }).sections;
  }
  return [
    { id: "subjective", title: "Subjective", type: "markdown" },
    { id: "objective", title: "Objective", type: "markdown" },
    { id: "assessment", title: "Assessment", type: "markdown" },
    { id: "plan", title: "Plan", type: "markdown" },
  ];
}
