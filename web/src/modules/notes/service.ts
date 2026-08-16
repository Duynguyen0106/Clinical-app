import { createHash } from "node:crypto";
import { z } from "zod";
import { NoteStatus, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import type { NoteContent } from "@/modules/ai/providers";

export async function listNoteTemplates(ctx: AuthContext) {
  return prisma.noteTemplate.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function listNotes(
  ctx: AuthContext,
  opts: { status?: NoteStatus; take?: number; practitionerId?: string } = {},
) {
  // Metadata only — never ship clinical content on list endpoints
  return prisma.clinicalNote.findMany({
    where: {
      patient: { clinicId: ctx.clinicId },
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.practitionerId
        ? {
            visit: {
              appointment: { practitionerId: opts.practitionerId },
            },
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      source: true,
      signedAt: true,
      createdAt: true,
      updatedAt: true,
      visitId: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      template: { select: { id: true, name: true } },
      visit: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(opts.take ?? 50, 100),
  });
}

export async function getNote(ctx: AuthContext, id: string) {
  const note = await prisma.clinicalNote.findFirst({
    where: { id, patient: { clinicId: ctx.clinicId } },
    include: {
      patient: true,
      template: true,
      audits: { orderBy: { createdAt: "desc" }, take: 50 },
      visit: { select: { id: true, appointmentId: true } },
    },
  });
  if (!note) throw notFound("Note not found");

  await prisma.noteAuditEvent.create({
    data: {
      noteId: note.id,
      actorId: ctx.userId,
      action: "viewed",
    },
  });

  return note;
}

export async function createDraftFromAi(
  ctx: AuthContext,
  args: {
    patientId: string;
    visitId: string;
    content: NoteContent | Record<string, unknown>;
    templateId?: string;
  },
) {
  let templateId = args.templateId;
  if (!templateId) {
    const def = await prisma.noteTemplate.findFirst({
      where: { clinicId: ctx.clinicId, isDefault: true },
    });
    templateId = def?.id;
  }

  const note = await prisma.clinicalNote.create({
    data: {
      patientId: args.patientId,
      visitId: args.visitId,
      templateId: templateId ?? null,
      status: NoteStatus.DRAFT,
      source: "ai",
      content: args.content as unknown as Prisma.InputJsonValue,
      audits: {
        create: {
          actorId: ctx.userId,
          action: "created",
          meta: { source: "ai" },
        },
      },
    },
  });

  return note;
}

export const updateNoteSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export async function updateDraftNote(
  ctx: AuthContext,
  id: string,
  content: Record<string, unknown>,
) {
  const note = await prisma.clinicalNote.findFirst({
    where: { id, patient: { clinicId: ctx.clinicId } },
  });
  if (!note) throw notFound("Note not found");
  if (note.status !== NoteStatus.DRAFT) {
    throw badRequest("Only draft notes can be edited");
  }

  return prisma.clinicalNote.update({
    where: { id },
    data: {
      content: content as Prisma.InputJsonValue,
      audits: {
        create: {
          actorId: ctx.userId,
          action: "updated",
        },
      },
    },
  });
}

export async function signNote(ctx: AuthContext, id: string) {
  const note = await prisma.clinicalNote.findFirst({
    where: { id, patient: { clinicId: ctx.clinicId } },
  });
  if (!note) throw notFound("Note not found");
  if (note.status !== NoteStatus.DRAFT) {
    throw badRequest("Only draft notes can be signed");
  }

  const contentHash = createHash("sha256")
    .update(JSON.stringify(note.content))
    .digest("hex");

  return prisma.clinicalNote.update({
    where: { id },
    data: {
      status: NoteStatus.SIGNED,
      signedAt: new Date(),
      signedById: ctx.userId,
      contentHash,
      audits: {
        create: {
          actorId: ctx.userId,
          action: "signed",
          meta: { contentHash },
        },
      },
    },
  });
}
