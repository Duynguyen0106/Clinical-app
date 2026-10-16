import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  assertCanManageSchedule,
  assertOwnsDiaryOrOwner,
  requireOwnerOrReception,
  requireStaff,
} from "@/server/rbac";
import { forbidden } from "@/server/errors";
import { prisma } from "@/server/db";
import {
  getAppointment,
  updateAppointment,
  updateAppointmentSchema,
} from "@/modules/scheduling/service";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const appointment = await getAppointment(ctx, params.id);
  return jsonOk({ appointment });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json();
  const parsed = updateAppointmentSchema.parse(body);

  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, clinicId: ctx.clinicId },
    select: { id: true, practitionerId: true },
  });
  if (!existing) {
    const { notFound } = await import("@/server/errors");
    throw notFound("Appointment not found");
  }

  if (
    parsed.startsAt !== undefined ||
    parsed.durationMinutes !== undefined ||
    parsed.appointmentTypeId !== undefined ||
    parsed.status === "CANCELLED" ||
    parsed.status === "NO_SHOW"
  ) {
    assertCanManageSchedule(ctx);
  } else if (parsed.additionalFeeCents !== undefined) {
    requireOwnerOrReception(ctx);
  } else if (ctx.role === "PRACTITIONER") {
    // Status / notes only on own diary
    assertOwnsDiaryOrOwner(ctx, existing.practitionerId);
  } else if (ctx.role === "RECEPTION" || ctx.role === "OWNER") {
    requireStaff(ctx);
  } else {
    throw forbidden("Not allowed to update this appointment");
  }

  const appointment = await updateAppointment(ctx, params.id, parsed);
  const notification =
    appointment &&
    typeof appointment === "object" &&
    "notification" in appointment
      ? (appointment as { notification?: unknown }).notification
      : undefined;
  return jsonOk({ appointment, notification });
});
