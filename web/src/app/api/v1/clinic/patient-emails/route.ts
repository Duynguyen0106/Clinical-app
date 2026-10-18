import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { requireStaff } from "@/server/rbac";
import { prisma } from "@/server/db";
import { z } from "zod";

const patientEmailSelect = {
  reminderHoursBefore: true,
  sameDayReminderEnabled: true,
  sameDayReminderHours: true,
  thankYouEnabled: true,
  thankYouDelayHours: true,
  reviewRequestEnabled: true,
  reviewRequestDelayDays: true,
  reviewUrl: true,
  noShowFollowUpEnabled: true,
  noShowFollowUpDelayHours: true,
} as const;

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const patientEmails = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: patientEmailSelect,
  });
  return jsonOk({ patientEmails });
});

const patchSchema = z.object({
  reminderHoursBefore: z.number().int().min(1).max(168).optional(),
  sameDayReminderEnabled: z.boolean().optional(),
  sameDayReminderHours: z.number().int().min(1).max(12).optional(),
  thankYouEnabled: z.boolean().optional(),
  thankYouDelayHours: z.number().int().min(1).max(168).optional(),
  reviewRequestEnabled: z.boolean().optional(),
  reviewRequestDelayDays: z.number().int().min(1).max(30).optional(),
  reviewUrl: z
    .union([z.string().url().max(500), z.literal(""), z.null()])
    .optional(),
  noShowFollowUpEnabled: z.boolean().optional(),
  noShowFollowUpDelayHours: z.number().int().min(1).max(168).optional(),
});

export const PATCH = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = patchSchema.parse(await req.json());
  const { reviewUrl, ...rest } = body;
  const patientEmails = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      ...rest,
      ...(reviewUrl !== undefined
        ? { reviewUrl: reviewUrl === "" ? null : reviewUrl }
        : {}),
    },
    select: patientEmailSelect,
  });
  return jsonOk({ patientEmails });
});
