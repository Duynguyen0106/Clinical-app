import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { requireStaff } from "@/server/rbac";
import { prisma } from "@/server/db";
import { z } from "zod";
import { DepositMode } from "@/generated/prisma/client";

const bookingSelect = {
  bookingMinNoticeHours: true,
  bookingMaxAdvanceDays: true,
  cancelMinNoticeHours: true,
  depositMode: true,
  depositDefaultCents: true,
  bookingPolicyText: true,
} as const;

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const booking = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: bookingSelect,
  });
  return jsonOk({ booking });
});

const patchSchema = z.object({
  bookingMinNoticeHours: z.number().int().min(0).max(168).optional(),
  bookingMaxAdvanceDays: z.number().int().min(1).max(365).optional(),
  cancelMinNoticeHours: z.number().int().min(0).max(168).optional(),
  depositMode: z.nativeEnum(DepositMode).optional(),
  depositDefaultCents: z.number().int().min(0).max(500_000).optional(),
  bookingPolicyText: z.string().min(1).max(2000).optional(),
});

export const PATCH = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = patchSchema.parse(await req.json());
  const booking = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: body,
    select: bookingSelect,
  });
  return jsonOk({ booking });
});
