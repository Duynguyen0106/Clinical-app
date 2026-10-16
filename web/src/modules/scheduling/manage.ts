import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { z } from "zod";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";
import { listClinicSlots } from "./slots";
import { assertWithinAvailability } from "./availability";

/** Floor TTL so patients can still manage within a week of booking. */
const MIN_TTL_MS = 7 * 24 * 60 * 60_000;
/** Extra hours beyond cancel notice so the link outlives the cancel window. */
const CANCEL_BUFFER_HOURS = 24;
/** Legacy default when clinic policy is unavailable. */
const FALLBACK_TTL_MS = MIN_TTL_MS;

function manageSecret() {
  return process.env.AUTH_SECRET ?? "treow-dev-secret-change-me";
}

function sealKey() {
  return createHash("sha256").update(`manage-seal:${manageSecret()}`).digest();
}

/** TTL = max(cancelMinNoticeHours + buffer, 7d). */
export function manageTokenTtlMs(cancelMinNoticeHours: number) {
  const fromPolicy =
    (Math.max(0, cancelMinNoticeHours) + CANCEL_BUFFER_HOURS) * 60 * 60_000;
  return Math.max(fromPolicy, MIN_TTL_MS);
}

/**
 * Opaque manage token (v2): sealed appointment id + expiry.
 * HMAC binds the id; raw appointmentId is not a plaintext URL segment.
 * Legacy v1 `id.exp.sig` tokens still verify until they expire.
 */
export function createManageToken(
  appointmentId: string,
  expiresAt = Date.now() + FALLBACK_TTL_MS,
) {
  const exp = String(expiresAt);
  const mac = createHmac("sha256", manageSecret())
    .update(`${appointmentId}.${exp}`)
    .digest();
  const plaintext = Buffer.concat([
    Buffer.from(appointmentId, "utf8"),
    Buffer.from("\0", "utf8"),
    Buffer.from(exp, "utf8"),
    Buffer.from("\0", "utf8"),
    mac,
  ]);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `v2.${sealed}`;
}

export function verifyManageToken(token: string): { appointmentId: string } {
  if (token.startsWith("v2.")) {
    return verifySealedManageToken(token.slice(3));
  }
  return verifyLegacyManageToken(token);
}

function verifySealedManageToken(sealed: string): { appointmentId: string } {
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64url");
  } catch {
    throw forbidden("Invalid manage link");
  }
  if (buf.length < 12 + 16 + 1) throw forbidden("Invalid manage link");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw forbidden("Invalid manage link");
  }
  const null1 = plaintext.indexOf(0);
  const null2 = plaintext.indexOf(0, null1 + 1);
  if (null1 < 0 || null2 < 0) throw forbidden("Invalid manage link");
  const id = plaintext.subarray(0, null1).toString("utf8");
  const expStr = plaintext.subarray(null1 + 1, null2).toString("utf8");
  const mac = plaintext.subarray(null2 + 1);
  if (!id || !expStr || Number(expStr) < Date.now()) {
    throw forbidden("This manage link has expired");
  }
  const expected = createHmac("sha256", manageSecret())
    .update(`${id}.${expStr}`)
    .digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw forbidden("Invalid manage link");
  }
  return { appointmentId: id };
}

function verifyLegacyManageToken(token: string): { appointmentId: string } {
  const parts = token.split(".");
  if (parts.length !== 3) throw forbidden("Invalid manage link");
  const [appointmentId, exp, sig] = parts;
  if (!appointmentId || !exp || !sig) throw forbidden("Invalid manage link");
  if (Number(exp) < Date.now()) throw forbidden("This manage link has expired");

  const payload = `${appointmentId}.${exp}`;
  const expected = createHmac("sha256", manageSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw forbidden("Invalid manage link");
  }
  return { appointmentId };
}

export async function manageUrl(appointmentId: string) {
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      clinic: { select: { cancelMinNoticeHours: true } },
    },
  });
  const hours = apt?.clinic.cancelMinNoticeHours ?? 24;
  const token = createManageToken(
    appointmentId,
    Date.now() + manageTokenTtlMs(hours),
  );
  return `${getAppBaseUrl()}/book/manage/${encodeURIComponent(token)}`;
}

const appointmentInclude = {
  patient: true,
  practitioner: true,
  appointmentType: true,
  room: true,
  clinic: {
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      cancelMinNoticeHours: true,
      bookingPolicyText: true,
    },
  },
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

  const { recordScheduleAudit } = await import("./audit");
  await recordScheduleAudit({
    clinicId: appointment.clinicId,
    appointmentId: appointment.id,
    actorId: null,
    action: "patient_cancelled",
    meta: { startsAt: appointment.startsAt.toISOString(), via: "manage_token" },
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
      clinicId: appointment.clinicId,
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

  const { recordScheduleAudit } = await import("./audit");
  await recordScheduleAudit({
    clinicId: appointment.clinicId,
    appointmentId: updated.id,
    actorId: null,
    action: "patient_rescheduled",
    meta: {
      fromStartsAt: previousStartsAt.toISOString(),
      toStartsAt: updated.startsAt.toISOString(),
      via: "manage_token",
    },
  });

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
