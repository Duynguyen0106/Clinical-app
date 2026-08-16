import { z } from "zod";
import {
  AppointmentStatus,
  RecordingStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";
import { mockOrganiseNote, mockTranscribe } from "@/modules/ai/mock-pipeline";
import { createDraftFromAi } from "@/modules/notes/service";

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
        notes: true,
      },
    });
  }

  const visit = await prisma.$transaction(async (tx) => {
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

  return visit;
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

export const stopRecordingSchema = z.object({
  durationSec: z.number().int().positive().optional(),
  /** Optional raw transcript override for tests; otherwise mock STT runs */
  transcriptText: z.string().optional(),
});

/**
 * Stop recording and run mock organise pipeline synchronously for MVP.
 * Later: enqueue jobs (UPLOADING → TRANSCRIBING → ORGANISING → READY).
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

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: {
      status: RecordingStatus.TRANSCRIBING,
      durationSec: input.durationSec ?? visit.recording.durationSec,
    },
  });

  const transcriptText =
    input.transcriptText ??
    (await mockTranscribe(visit.recording.storageKey ?? visit.id));

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

  const patientName = `${visit.appointment.patient.firstName} ${visit.appointment.patient.lastName}`;
  const organised = await mockOrganiseNote({
    transcript: transcriptText,
    patientName,
    appointmentType: visit.appointment.appointmentType.name,
  });

  const note = await createDraftFromAi(ctx, {
    patientId: visit.appointment.patientId,
    visitId: visit.id,
    content: organised,
  });

  await prisma.recording.update({
    where: { id: visit.recording.id },
    data: { status: RecordingStatus.READY },
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
  };
}
