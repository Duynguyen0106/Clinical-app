import { z } from "zod";
import { NoteStatus, Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";
import type { NoteContent } from "@/modules/ai/providers";
import { hashNoteContent } from "@/modules/notes/hash";
import { assertNoteDiaryAccess } from "@/modules/notes/access";
import {
  BODY_MAP_CONTENT_KEY,
  sanitizeNoteContent,
} from "@/modules/notes/body-map";
import { withClinicTransaction } from "@/server/clinic-rls";
import { assertOwnsDiaryOrOwner } from "@/server/rbac";

export { hashNoteContent } from "@/modules/notes/hash";
export { assertNoteDiaryAccess } from "@/modules/notes/access";

export async function listNoteTemplates(ctx: AuthContext) {
  return prisma.noteTemplate.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

const noteSectionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/i, "Section id must be alphanumeric"),
  title: z.string().trim().min(1).max(120),
  type: z.enum(["markdown", "body_map"]),
  hint: z.string().trim().max(400).optional(),
});

export const noteTemplateUpsertSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    isDefault: z.boolean().optional(),
    sections: z.array(noteSectionSchema).min(1).max(24),
  })
  .superRefine((val, ctx) => {
    const ids = val.sections.map((s) => s.id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Section ids must be unique",
        path: ["sections"],
      });
    }
    const charts = val.sections.filter((s) => s.type === "body_map");
    if (charts.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: "At most one body chart section is allowed",
        path: ["sections"],
      });
    }
  })
  .transform((val) => ({
    ...val,
    sections: val.sections.map((s) =>
      s.type === "body_map"
        ? { ...s, id: BODY_MAP_CONTENT_KEY, title: s.title || "Body chart" }
        : s,
    ),
  }));

export async function createNoteTemplate(
  ctx: AuthContext,
  input: z.infer<typeof noteTemplateUpsertSchema>,
) {
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    if (input.isDefault) {
      await tx.noteTemplate.updateMany({
        where: { clinicId: ctx.clinicId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.noteTemplate.create({
      data: {
        clinicId: ctx.clinicId,
        name: input.name,
        isDefault: input.isDefault ?? false,
        schema: { sections: input.sections } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function updateNoteTemplate(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof noteTemplateUpsertSchema>,
) {
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const existing = await tx.noteTemplate.findFirst({
      where: { id, clinicId: ctx.clinicId },
    });
    if (!existing) throw notFound("Template not found");

    if (input.isDefault) {
      await tx.noteTemplate.updateMany({
        where: {
          clinicId: ctx.clinicId,
          isDefault: true,
          NOT: { id },
        },
        data: { isDefault: false },
      });
    }

    return tx.noteTemplate.update({
      where: { id },
      data: {
        name: input.name,
        isDefault: input.isDefault ?? existing.isDefault,
        schema: { sections: input.sections } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function deleteNoteTemplate(ctx: AuthContext, id: string) {
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const existing = await tx.noteTemplate.findFirst({
      where: { id, clinicId: ctx.clinicId },
      include: { _count: { select: { notes: true } } },
    });
    if (!existing) throw notFound("Template not found");
    if (existing._count.notes > 0) {
      throw badRequest(
        "Template is used by existing notes — set another default instead of deleting",
      );
    }
    await tx.noteTemplate.delete({ where: { id } });
    return { ok: true as const };
  });
}

export async function listNotes(
  ctx: AuthContext,
  opts: { status?: NoteStatus; take?: number; practitionerId?: string } = {},
) {
  // Practitioners default to own diary; cannot list a peer's diary metadata.
  // Fail closed without a profile — never return clinic-wide note metadata.
  let practitionerId = opts.practitionerId;
  if (ctx.role === "PRACTITIONER") {
    if (!ctx.practitionerProfileId) return [];
    practitionerId = ctx.practitionerProfileId;
  }

  // Metadata only — never ship clinical content on list endpoints
  return prisma.clinicalNote.findMany({
    where: {
      patient: { clinicId: ctx.clinicId },
      ...(opts.status ? { status: opts.status } : {}),
      ...(practitionerId
        ? {
            OR: [
              // Notes on this practitioner's diary visits
              {
                visit: {
                  appointment: { practitionerId },
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
  await assertNoteDiaryAccess(ctx, id);

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

  await withClinicTransaction(ctx.clinicId, async (tx) => {
    await tx.noteAuditEvent.create({
      data: {
        noteId: note.id,
        actorId: ctx.userId,
        action: "viewed",
      },
    });
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
  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const visit = await tx.visit.findFirst({
      where: {
        id: args.visitId,
        appointment: { clinicId: ctx.clinicId },
      },
      include: {
        appointment: {
          select: { practitionerId: true, patientId: true },
        },
      },
    });
    if (!visit) throw notFound("Visit not found");
    if (visit.appointment.patientId !== args.patientId) {
      throw badRequest("Visit does not belong to this patient");
    }
    assertOwnsDiaryOrOwner(ctx, visit.appointment.practitionerId);

    let templateId = args.templateId;
    if (!templateId) {
      const def = await tx.noteTemplate.findFirst({
        where: { clinicId: ctx.clinicId, isDefault: true },
      });
      templateId = def?.id;
    }

    // Idempotent: retries after STT/organise timeout must not spawn duplicate drafts
    const existing = await tx.clinicalNote.findFirst({
      where: {
        visitId: args.visitId,
        status: NoteStatus.DRAFT,
        patient: { clinicId: ctx.clinicId },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const merged = sanitizeNoteContent(
        args.content as Record<string, unknown>,
        { preserveBodyMapFrom: existing.content },
      );
      return tx.clinicalNote.update({
        where: { id: existing.id },
        data: {
          templateId: templateId ?? existing.templateId,
          source: "ai",
          content: merged as Prisma.InputJsonValue,
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

    const createdContent = sanitizeNoteContent(
      args.content as Record<string, unknown>,
    );
    return tx.clinicalNote.create({
      data: {
        patientId: args.patientId,
        visitId: args.visitId,
        templateId: templateId ?? null,
        status: NoteStatus.DRAFT,
        source: "ai",
        content: createdContent as Prisma.InputJsonValue,
        audits: {
          create: {
            actorId: ctx.userId,
            action: "created",
            meta: { source: "ai" },
          },
        },
      },
    });
  });
}

export const updateNoteSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export async function updateDraftNote(
  ctx: AuthContext,
  id: string,
  content: Record<string, unknown>,
) {
  await assertNoteDiaryAccess(ctx, id);

  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const note = await tx.clinicalNote.findFirst({
      where: { id, patient: { clinicId: ctx.clinicId } },
    });
    if (!note) throw notFound("Note not found");
    if (note.status !== NoteStatus.DRAFT) {
      throw badRequest("Only draft notes can be edited");
    }

    const sanitized = sanitizeNoteContent(content);

    return tx.clinicalNote.update({
      where: { id },
      data: {
        content: sanitized as Prisma.InputJsonValue,
        audits: {
          create: {
            actorId: ctx.userId,
            action: "updated",
            meta: { hasBodyMap: true },
          },
        },
      },
    });
  });
}

export async function signNote(ctx: AuthContext, id: string) {
  await assertNoteDiaryAccess(ctx, id);

  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const note = await tx.clinicalNote.findFirst({
      where: { id, patient: { clinicId: ctx.clinicId } },
    });
    if (!note) throw notFound("Note not found");
    if (note.status !== NoteStatus.DRAFT) {
      throw badRequest("Only draft notes can be signed");
    }

    const raw =
      note.content && typeof note.content === "object" && !Array.isArray(note.content)
        ? (note.content as Record<string, unknown>)
        : {};
    const sanitized = sanitizeNoteContent(raw);
    const contentHash = hashNoteContent(sanitized);

    return tx.clinicalNote.update({
      where: { id },
      data: {
        content: sanitized as Prisma.InputJsonValue,
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
  await assertNoteDiaryAccess(ctx, id);

  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const note = await tx.clinicalNote.findFirst({
      where: { id, patient: { clinicId: ctx.clinicId } },
    });
    if (!note) throw notFound("Note not found");
    if (note.status !== NoteStatus.SIGNED) {
      throw badRequest("Only signed notes can be voided");
    }

    return tx.clinicalNote.update({
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
  await assertNoteDiaryAccess(ctx, parentId);

  return withClinicTransaction(ctx.clinicId, async (tx) => {
    const parent = await tx.clinicalNote.findFirst({
      where: { id: parentId, patient: { clinicId: ctx.clinicId } },
    });
    if (!parent) throw notFound("Note not found");
    if (parent.status !== NoteStatus.SIGNED) {
      throw badRequest("Addenda can only be attached to signed notes");
    }

    const existingDraft = await tx.clinicalNote.findFirst({
      where: {
        parentNoteId: parent.id,
        status: NoteStatus.DRAFT,
      },
    });
    if (existingDraft) {
      throw badRequest("An unsigned addendum already exists for this note");
    }

    return tx.clinicalNote.create({
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
  });
}
