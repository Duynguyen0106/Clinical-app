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
  depositBankAccountName: true,
  depositBankSortCode: true,
  depositBankAccountNumber: true,
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

const optionalBankText = z
  .union([z.string().max(120), z.literal(""), z.null()])
  .optional();

const patchSchema = z.object({
  bookingMinNoticeHours: z.number().int().min(0).max(168).optional(),
  bookingMaxAdvanceDays: z.number().int().min(1).max(365).optional(),
  cancelMinNoticeHours: z.number().int().min(0).max(168).optional(),
  depositMode: z.nativeEnum(DepositMode).optional(),
  depositDefaultCents: z.number().int().min(0).max(500_000).optional(),
  depositBankAccountName: optionalBankText,
  depositBankSortCode: optionalBankText,
  depositBankAccountNumber: optionalBankText,
  bookingPolicyText: z.string().min(1).max(2000).optional(),
});

function normalizeBankField(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value.trim();
}

export const PATCH = withAuth(async (req, ctx) => {
  requireRole(ctx, ["OWNER"]);
  const body = patchSchema.parse(await req.json());
  const {
    depositBankAccountName,
    depositBankSortCode,
    depositBankAccountNumber,
    ...rest
  } = body;
  const booking = await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: {
      ...rest,
      ...(depositBankAccountName !== undefined
        ? { depositBankAccountName: normalizeBankField(depositBankAccountName) }
        : {}),
      ...(depositBankSortCode !== undefined
        ? {
            depositBankSortCode: normalizeBankField(depositBankSortCode)?.replace(
              /\s/g,
              "",
            ),
          }
        : {}),
      ...(depositBankAccountNumber !== undefined
        ? {
            depositBankAccountNumber: normalizeBankField(
              depositBankAccountNumber,
            )?.replace(/\D/g, ""),
          }
        : {}),
    },
    select: bookingSelect,
  });
  return jsonOk({ booking });
});
