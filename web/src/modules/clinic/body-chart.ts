import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest } from "@/server/errors";
import {
  MAX_ARCHIVED_CUSTOM_VIEWS,
  parseBodyChartConfig,
  sanitizeAnatomySvg,
  type BodyChartConfig,
  type BodyChartCustomView,
} from "@/modules/notes/body-map";
import { withSerializableRetry } from "@/server/serializable-retry";

export async function getClinicBodyChartConfig(
  ctx: AuthContext,
): Promise<BodyChartConfig> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { bodyChartConfig: true },
  });
  return parseBodyChartConfig(clinic.bodyChartConfig);
}

export const upsertCustomViewSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^custom_[a-z0-9_-]{1,40}$/i)
    .optional(),
  label: z.string().trim().min(2).max(80),
  svg: z.string().trim().min(20).max(80_000),
});

export async function upsertClinicCustomAnatomyView(
  ctx: AuthContext,
  input: z.infer<typeof upsertCustomViewSchema>,
) {
  requireRole(ctx, ["OWNER"]);
  const svg = sanitizeAnatomySvg(input.svg);
  if (!svg) {
    throw badRequest(
      "SVG rejected — use a plain <svg> with path/shape elements only (no scripts, handlers, or images)",
    );
  }
  const id =
    input.id ??
    `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const view: BodyChartCustomView = {
    id,
    label: input.label,
    svg,
  };

  // Serializable transaction reduces lost-update races on JSON config
  return withSerializableRetry(async () =>
    prisma.$transaction(
      async (tx) => {
        const clinic = await tx.clinic.findUniqueOrThrow({
          where: { id: ctx.clinicId },
          select: { bodyChartConfig: true },
        });
        const current = parseBodyChartConfig(clinic.bodyChartConfig);
        const others = current.customViews.filter((v) => v.id !== id);
        if (others.length >= 12 && !current.customViews.some((v) => v.id === id)) {
          throw badRequest("Maximum of 12 custom anatomy views");
        }
        // Restoring an archived id pulls it back into the active list
        const archivedViews = (current.archivedViews ?? []).filter(
          (v) => v.id !== id,
        );
        const next: BodyChartConfig = {
          customViews: [...others, view],
          ...(archivedViews.length ? { archivedViews } : {}),
        };
        await tx.clinic.update({
          where: { id: ctx.clinicId },
          data: { bodyChartConfig: next as unknown as Prisma.InputJsonValue },
        });
        return next;
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function deleteClinicCustomAnatomyView(
  ctx: AuthContext,
  viewId: string,
) {
  requireRole(ctx, ["OWNER"]);
  return withSerializableRetry(async () =>
    prisma.$transaction(
      async (tx) => {
        const clinic = await tx.clinic.findUniqueOrThrow({
          where: { id: ctx.clinicId },
          select: { bodyChartConfig: true },
        });
        const current = parseBodyChartConfig(clinic.bodyChartConfig);
        const removed = current.customViews.find((v) => v.id === viewId);
        const customViews = current.customViews.filter((v) => v.id !== viewId);
        // Soft-delete: keep SVG so historical marks still render
        let archivedViews = (current.archivedViews ?? []).filter(
          (v) => v.id !== viewId,
        );
        if (removed) {
          archivedViews = [removed, ...archivedViews].slice(
            0,
            MAX_ARCHIVED_CUSTOM_VIEWS,
          );
        }
        const next: BodyChartConfig = {
          customViews,
          ...(archivedViews.length ? { archivedViews } : {}),
        };
        await tx.clinic.update({
          where: { id: ctx.clinicId },
          data: { bodyChartConfig: next as unknown as Prisma.InputJsonValue },
        });
        return next;
      },
      { isolationLevel: "Serializable" },
    ),
  );
}
