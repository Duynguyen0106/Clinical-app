import { z } from "zod";

export const LEAVE_REASONS = [
  "Annual leave",
  "Sick leave",
  "Training / CPD",
  "Other",
] as const;

export const createLeaveRequestSchema = z.object({
  practitionerId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(120),
  allDay: z.boolean().optional(),
  startMinute: z.number().int().min(0).max(24 * 60 - 1).optional().nullable(),
  endMinute: z.number().int().min(1).max(24 * 60).optional().nullable(),
});

export const reviewLeaveRequestSchema = z.object({
  note: z.string().trim().max(400).optional().nullable(),
});

export function isLeaveReason(reason: string | null | undefined) {
  if (!reason) return false;
  const normalised = reason.trim().toLowerCase();
  if (LEAVE_REASONS.some((r) => r.toLowerCase() === normalised)) return true;
  return /\bleave\b/i.test(reason) || /training\s*\/?\s*cpd/i.test(reason);
}
