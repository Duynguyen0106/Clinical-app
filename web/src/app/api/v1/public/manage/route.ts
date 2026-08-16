import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import {
  cancelManagedAppointment,
  getManagedAppointment,
  listManagedSlots,
  manageCancelSchema,
  manageRescheduleSchema,
  rescheduleManagedAppointment,
} from "@/modules/scheduling/manage";
import { enforcePublicManageLimits } from "@/server/abuse";

export const GET = withPublic(async (req) => {
  enforcePublicManageLimits(req);
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) throw badRequest("token required");
  const wantSlots = url.searchParams.get("slots") === "1";
  if (wantSlots) {
    const { appointment, slots } = await listManagedSlots(token);
    return jsonOk({
      appointment: serialize(appointment),
      slots,
    });
  }
  const appointment = await getManagedAppointment(token);
  return jsonOk({ appointment: serialize(appointment) });
});

export const POST = withPublic(async (req) => {
  enforcePublicManageLimits(req);
  const body = await req.json();
  if (body.action === "cancel") {
    const parsed = manageCancelSchema.parse(body);
    const appointment = await cancelManagedAppointment(parsed.token);
    return jsonOk({ appointment: serialize(appointment) });
  }
  if (body.action === "reschedule") {
    const parsed = manageRescheduleSchema.parse(body);
    const appointment = await rescheduleManagedAppointment(
      parsed.token,
      parsed.startsAt,
    );
    return jsonOk({ appointment: serialize(appointment) });
  }
  throw badRequest("action must be cancel or reschedule");
});

function serialize(appointment: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  patient: { firstName: string; lastName: string; email: string | null };
  practitioner: { displayName: string };
  appointmentType: { name: string; durationMinutes: number };
  room: { name: string } | null;
  clinic: { name: string; slug: string; timezone: string };
}) {
  return {
    id: appointment.id,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: appointment.status,
    patient: {
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      email: appointment.patient.email,
    },
    practitioner: { displayName: appointment.practitioner.displayName },
    appointmentType: {
      name: appointment.appointmentType.name,
      durationMinutes: appointment.appointmentType.durationMinutes,
    },
    room: appointment.room,
    clinic: appointment.clinic,
  };
}
