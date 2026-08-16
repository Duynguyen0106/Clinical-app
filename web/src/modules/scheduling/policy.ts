import { DepositMode } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict } from "@/server/errors";

export type BookingPolicy = {
  bookingMinNoticeHours: number;
  bookingMaxAdvanceDays: number;
  cancelMinNoticeHours: number;
  depositMode: DepositMode;
  depositDefaultCents: number;
  bookingPolicyText: string;
};

export async function getClinicBookingPolicy(clinicId: string): Promise<BookingPolicy> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: {
      bookingMinNoticeHours: true,
      bookingMaxAdvanceDays: true,
      cancelMinNoticeHours: true,
      depositMode: true,
      depositDefaultCents: true,
      bookingPolicyText: true,
    },
  });
  return clinic;
}

export function assertSlotWithinBookingWindow(
  policy: BookingPolicy,
  startsAt: Date,
  now = new Date(),
) {
  const minMs = policy.bookingMinNoticeHours * 60 * 60_000;
  const maxMs = policy.bookingMaxAdvanceDays * 24 * 60 * 60_000;
  const delta = startsAt.getTime() - now.getTime();
  if (delta < minMs) {
    throw conflict(
      `Online booking needs at least ${policy.bookingMinNoticeHours} hours’ notice`,
    );
  }
  if (delta > maxMs) {
    throw conflict(
      `Online booking is only open ${policy.bookingMaxAdvanceDays} days ahead`,
    );
  }
}

export function assertWithinCancelWindow(
  policy: BookingPolicy,
  startsAt: Date,
  now = new Date(),
) {
  const minMs = policy.cancelMinNoticeHours * 60 * 60_000;
  if (startsAt.getTime() - now.getTime() < minMs) {
    throw badRequest(
      `Online changes close within ${policy.cancelMinNoticeHours} hours of the appointment — please call the clinic`,
    );
  }
}

export function isSlotAllowedByPolicy(
  policy: BookingPolicy,
  startsAt: Date,
  now = new Date(),
) {
  const minMs = policy.bookingMinNoticeHours * 60 * 60_000;
  const maxMs = policy.bookingMaxAdvanceDays * 24 * 60 * 60_000;
  const delta = startsAt.getTime() - now.getTime();
  return delta >= minMs && delta <= maxMs;
}

export async function resolveDepositRequirement(args: {
  clinicId: string;
  appointmentTypeId: string;
  patientId: string;
  isOnline: boolean;
}) {
  const [policy, type, priorCount] = await Promise.all([
    getClinicBookingPolicy(args.clinicId),
    prisma.appointmentType.findFirstOrThrow({
      where: { id: args.appointmentTypeId, clinicId: args.clinicId },
      select: { depositCents: true, defaultPriceCents: true },
    }),
    prisma.appointment.count({
      where: {
        clinicId: args.clinicId,
        patientId: args.patientId,
        status: { notIn: ["CANCELLED"] },
      },
    }),
  ]);

  if (!args.isOnline || policy.depositMode === DepositMode.OFF) {
    return { required: false, cents: 0, policy };
  }

  const isNew = priorCount === 0;
  const applies =
    policy.depositMode === DepositMode.ALL_ONLINE ||
    (policy.depositMode === DepositMode.NEW_PATIENTS && isNew);

  if (!applies) {
    return { required: false, cents: 0, policy };
  }

  const cents =
    type.depositCents ??
    (policy.depositDefaultCents > 0
      ? policy.depositDefaultCents
      : type.defaultPriceCents > 0
        ? Math.min(type.defaultPriceCents, policy.depositDefaultCents || 2000)
        : policy.depositDefaultCents);

  return { required: cents > 0, cents: Math.max(0, cents), policy };
}
