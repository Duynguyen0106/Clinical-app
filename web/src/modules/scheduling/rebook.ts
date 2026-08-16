import { z } from "zod";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { listClinicSlots } from "@/modules/scheduling/slots";
import { createAppointment } from "@/modules/scheduling/service";
import { addWeeks } from "date-fns";

export function inferFollowUpWeeks(planText: string | undefined) {
  if (!planText) return 2;
  const lower = planText.toLowerCase();
  const weekMatch = lower.match(/(\d+)\s*weeks?/);
  if (weekMatch) return Math.min(12, Math.max(1, Number(weekMatch[1])));
  if (lower.includes("next week") || lower.includes("1 week")) return 1;
  if (lower.includes("fortnight") || lower.includes("two weeks")) return 2;
  if (lower.includes("month")) return 4;
  return 2;
}

export async function suggestRebook(ctx: AuthContext, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, appointment: { clinicId: ctx.clinicId } },
    include: {
      appointment: {
        include: { appointmentType: true, patient: true },
      },
      notes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!visit) throw notFound("Visit not found");

  const note = visit.notes[0];
  const content = (note?.content ?? {}) as Record<string, unknown>;
  const plan =
    typeof content.plan === "string"
      ? content.plan
      : typeof content["plan_&_advice"] === "string"
        ? (content["plan_&_advice"] as string)
        : "";

  const weeks = inferFollowUpWeeks(plan);
  const from = addWeeks(new Date(), weeks);

  const types = await prisma.appointmentType.findMany({
    where: { clinicId: ctx.clinicId, active: true },
  });
  const followUp =
    types.find((t) => /follow|review/i.test(t.name)) ??
    visit.appointment.appointmentType;

  const slots = await listClinicSlots({
    clinicId: ctx.clinicId,
    appointmentTypeId: followUp.id,
    practitionerId: visit.appointment.practitionerId,
    from,
    days: 14,
  });

  return {
    visitId,
    patientId: visit.appointment.patientId,
    practitionerId: visit.appointment.practitionerId,
    appointmentTypeId: followUp.id,
    appointmentTypeName: followUp.name,
    suggestedWeeks: weeks,
    planExcerpt: plan.slice(0, 240),
    slots: slots.slice(0, 8),
  };
}

export const rebookSchema = z.object({
  startsAt: z.string().datetime(),
  appointmentTypeId: z.string().optional(),
});

export async function bookFollowUp(
  ctx: AuthContext,
  visitId: string,
  input: z.infer<typeof rebookSchema>,
) {
  const suggestion = await suggestRebook(ctx, visitId);

  return createAppointment(ctx, {
    patientId: suggestion.patientId,
    practitionerId: suggestion.practitionerId,
    appointmentTypeId: input.appointmentTypeId ?? suggestion.appointmentTypeId,
    startsAt: input.startsAt,
    notes: "Follow-up booked from visit plan",
  });
}
