import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";
import { listClinicSlots } from "./slots";
import { assertWithinAvailability } from "./availability";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

function manageSecret() {
  return process.env.AUTH_SECRET ?? "treow-dev-secret-change-me";
}

export function createManageToken(appointmentId: string, expiresAt = Date.now() + TOKEN_TTL_MS) {
  const exp = String(expiresAt);
  const payload = `${appointmentId}.${exp}`;
  const sig = createHmac("sha256", manageSecret()).update(payload).digest("base64url");
  return `${appointmentId}.${exp}.${sig}`;
}

export function verifyManageToken(token: string): { appointmentId: string } {
  const parts = token.split(".");
  if (parts.length !== 3) throw forbidden("Invalid manage link");
  const [appointmentId, exp, sig] = parts;
  if (!appointmentId || !exp || !sig) throw forbidden("Invalid manage link");
  if (Number(exp) < Date.now()) throw forbidden("This manage link has expired");

  const payload = `${appointmentId}.${exp}`;
  const expected = createHmac("sha256", manageSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw forbidden("Invalid manage link");
  }
  return { appointmentId };
}

export function manageUrl(appointmentId: string) {
  const token = createManageToken(appointmentId);
  return `${getAppBaseUrl()}/book/manage/${encodeURIComponent(token)}`;
}

const appointmentInclude = {
  patient: true,
  practitioner: true,
  appointmentType: true,
  room: true,
  clinic: { select: { id: true, name: true, slug: true, timezone: true } },
} as const;

export async function getManagedAppointment(token: string) {
  const { appointmentId } = verifyManageToken(token);
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw notFound("Appointment not found");
  return appointment;
}

export async function listManagedSlots(token: string) {
  const appointment = await getManagedAppointment(token);
  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.COMPLETED ||
    appointment.status === AppointmentStatus.NO_SHOW
  ) {
    throw badRequest("This appointment can no longer be changed online");
  }

  const slots = await listClinicSlots({
    clinicId: appointment.clinicId,
    appointmentTypeId: appointment.appointmentTypeId,
    practitionerId: appointment.practitionerId,
    days: 21,
    onlineBookableOnly: true,
    durationMinutes:
      (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
    excludeAppointmentId: appointment.id,
  });

  return { appointment, slots };
}

export const manageCancelSchema = z.object({
  token: z.string().min(10),
});

export async function cancelManagedAppointment(token: string) {
  const appointment = await getManagedAppointment(token);
  if (appointment.status === AppointmentStatus.CANCELLED) {
    return appointment;
  }
  if (
    appointment.status === AppointmentStatus.COMPLETED ||
    appointment.status === AppointmentStatus.IN_PROGRESS ||
    appointment.status === AppointmentStatus.NO_SHOW
  ) {
    throw badRequest("This appointment can no longer be cancelled online");
  }

  // Patients may cancel until clinic cancel window
  const { getClinicBookingPolicy, assertWithinCancelWindow } = await import(
    "./policy"
  );
  const policy = await getClinicBookingPolicy(appointment.clinicId);
  assertWithinCancelWindow(policy, appointment.startsAt);

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
    include: appointmentInclude,
  });

  try {
    const { sendAppointmentCancelled } = await import(
      "@/modules/notifications/appointments"
    );
    await sendAppointmentCancelled(appointment.id);
  } catch (err) {
    console.error("Patient cancel notification failed", err);
  }

  try {
    const { offerSlotToWaitlist } = await import("./waitlist");
    await offerSlotToWaitlist({
      clinicId: appointment.clinicId,
      appointmentTypeId: appointment.appointmentTypeId,
      practitionerId: appointment.practitionerId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      sourceAppointmentId: appointment.id,
    });
  } catch (err) {
    console.error("Waitlist offer after patient cancel failed", err);
  }

  return updated;
}

export const manageRescheduleSchema = z.object({
  token: z.string().min(10),
  startsAt: z.string().datetime(),
});

export async function rescheduleManagedAppointment(
  token: string,
  startsAtIso: string,
) {
  const appointment = await getManagedAppointment(token);
  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.COMPLETED ||
    appointment.status === AppointmentStatus.NO_SHOW ||
    appointment.status === AppointmentStatus.IN_PROGRESS
  ) {
    throw badRequest("This appointment can no longer be rescheduled online");
  }

  const { getClinicBookingPolicy, assertWithinCancelWindow } = await import(
    "./policy"
  );
  const policy = await getClinicBookingPolicy(appointment.clinicId);
  assertWithinCancelWindow(policy, appointment.startsAt);

  const startsAt = new Date(startsAtIso);
  const durationMs =
    appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const durationMinutes = durationMs / 60_000;

  const slots = await listClinicSlots({
    clinicId: appointment.clinicId,
    appointmentTypeId: appointment.appointmentTypeId,
    practitionerId: appointment.practitionerId,
    days: 21,
    onlineBookableOnly: true,
    durationMinutes,
    excludeAppointmentId: appointment.id,
  });

  if (!slots.includes(startsAt.toISOString()) && !slots.includes(startsAtIso)) {
    // Allow if within 1 minute of a listed slot (ISO formatting)
    const ok = slots.some(
      (s) => Math.abs(new Date(s).getTime() - startsAt.getTime()) < 60_000,
    );
    if (!ok) throw conflict("That slot is no longer available");
  }

  await assertWithinAvailability({
    clinicId: appointment.clinicId,
    practitionerId: appointment.practitionerId,
    startsAt,
    endsAt,
  });

  const { assertNoConflict } = await import("./service");
  const { withScheduleLocks } = await import("./locks");
  const previousStartsAt = appointment.startsAt;

  const updated = await withScheduleLocks(
    prisma,
    {
      practitionerId: appointment.practitionerId,
      roomId: appointment.roomId,
    },
    async (tx) => {
      await assertNoConflict(
        {
          clinicId: appointment.clinicId,
          practitionerId: appointment.practitionerId,
          roomId: appointment.roomId,
          startsAt,
          endsAt,
          bufferBefore: appointment.appointmentType.bufferBefore,
          bufferAfter: appointment.appointmentType.bufferAfter,
          excludeAppointmentId: appointment.id,
        },
        tx as typeof prisma,
      );

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
          status: AppointmentStatus.BOOKED,
          reminderSentAt: null,
          smsReminderSentAt: null,
        },
        include: appointmentInclude,
      });
    },
  );

  try {
    const { sendAppointmentRescheduled } = await import(
      "@/modules/notifications/appointments"
    );
    await sendAppointmentRescheduled({
      appointmentId: updated.id,
      previousStartsAt,
    });
  } catch (err) {
    console.error("Patient reschedule notification failed", err);
  }

  return updated;
}
