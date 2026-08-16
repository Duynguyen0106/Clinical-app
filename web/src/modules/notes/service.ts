import { z } from "zod";
import { NoteStatus, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import type { NoteContent } from "@/modules/ai/providers";
import { hashNoteContent } from "@/modules/notes/hash";

export { hashNoteContent } from "@/modules/notes/hash";

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
            OR: [
              // Notes on this practitioner's diary visits
              {
                visit: {
                  appointment: { practitionerId: opts.practitionerId },
                },
              },
              // Notes this user signed (covers another diary / addenda)
              { signedById: ctx.userId },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      source: true,
      signedAt: true,
      voidedAt: true,
      createdAt: true,
      updatedAt: true,
      visitId: true,
      parentNoteId: true,
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
      parentNote: { select: { id: true, status: true, signedAt: true } },
      addenda: {
        select: { id: true, status: true, signedAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
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

  // Idempotent: retries after STT/organise timeout must not spawn duplicate drafts
  const existing = await prisma.clinicalNote.findFirst({
    where: {
      visitId: args.visitId,
      status: NoteStatus.DRAFT,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.clinicalNote.update({
      where: { id: existing.id },
      data: {
        templateId: templateId ?? existing.templateId,
        source: "ai",
        content: args.content as unknown as Prisma.InputJsonValue,
        audits: {
          create: {
            actorId: ctx.userId,
            action: "updated",
            meta: { source: "ai", reason: "organise_retry" },
          },
        },
      },
    });
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

  const contentHash = hashNoteContent(note.content);

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

export const voidNoteSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

/** Clinically correct a signed note — original retained as VOIDED with reason. */
export async function voidSignedNote(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof voidNoteSchema>,
) {
  const note = await prisma.clinicalNote.findFirst({
    where: { id, patient: { clinicId: ctx.clinicId } },
  });
  if (!note) throw notFound("Note not found");
  if (note.status !== NoteStatus.SIGNED) {
    throw badRequest("Only signed notes can be voided");
  }

  return prisma.clinicalNote.update({
    where: { id },
    data: {
      status: NoteStatus.VOIDED,
      voidedAt: new Date(),
      voidReason: input.reason,
      audits: {
        create: {
          actorId: ctx.userId,
          action: "voided",
          meta: { reason: input.reason },
        },
      },
    },
  });
}

export const addendumSchema = z.object({
  text: z.string().trim().min(1).max(8000),
});

/**
 * Create a draft addendum linked to a signed note (same patient/visit).
 * Clinician reviews and signs separately — signed body stays immutable.
 */
export async function createAddendumDraft(
  ctx: AuthContext,
  parentId: string,
  input: z.infer<typeof addendumSchema>,
) {
  const parent = await prisma.clinicalNote.findFirst({
    where: { id: parentId, patient: { clinicId: ctx.clinicId } },
  });
  if (!parent) throw notFound("Note not found");
  if (parent.status !== NoteStatus.SIGNED) {
    throw badRequest("Addenda can only be attached to signed notes");
  }

  const existingDraft = await prisma.clinicalNote.findFirst({
    where: {
      parentNoteId: parent.id,
      status: NoteStatus.DRAFT,
    },
  });
  if (existingDraft) {
    throw badRequest("An unsigned addendum already exists for this note");
  }

  return prisma.clinicalNote.create({
    data: {
      patientId: parent.patientId,
      visitId: parent.visitId,
      templateId: parent.templateId,
      parentNoteId: parent.id,
      status: NoteStatus.DRAFT,
      source: "addendum",
      content: {
        addendum: input.text,
        clinician_review_flags: [
          "Addendum to a signed note — review carefully before signing.",
        ],
      } as Prisma.InputJsonValue,
      audits: {
        create: {
          actorId: ctx.userId,
          action: "created",
          meta: { source: "addendum", parentNoteId: parent.id },
        },
      },
    },
  });
}
