import { z } from "zod";

export const createAppointmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  /** List price in GBP pence (max £10,000) */
  defaultPriceCents: z.number().int().min(0).max(1_000_000),
  depositCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  bufferBefore: z.number().int().min(0).max(120).optional(),
  bufferAfter: z.number().int().min(0).max(120).optional(),
  colour: z.string().max(20).optional(),
  onlineBookable: z.boolean().optional(),
});

export const updateAppointmentTypeSchema = createAppointmentTypeSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
  });
