import { z } from "zod";
import { AppointmentStatus, LeaveRequestStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";

const LEAVE_REASONS = [
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

function parseDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function eachDateInclusive(from: Date, to: Date) {
  const out: Date[] = [];
  const cur = new Date(from);
  while (cur.getTime() <= to.getTime()) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function assertCanRequestFor(
  ctx: AuthContext,
  practitionerId: string,
  profileId: string,
) {
  if (ctx.role === "OWNER" || ctx.role === "RECEPTION") return;
  if (ctx.role === "PRACTITIONER" && ctx.practitionerProfileId === profileId) {
    return;
  }
  throw forbidden("You can only request leave for your own diary");
}

export async function listLeaveRequests(
  ctx: AuthContext,
  opts: {
    status?: LeaveRequestStatus;
    practitionerId?: string;
    pendingOnly?: boolean;
  } = {},
) {
  const statusFilter = opts.pendingOnly
    ? LeaveRequestStatus.PENDING
    : opts.status;

  // Practitioners only see their own requests
  const practitionerId =
    ctx.role === "PRACTITIONER"
      ? ctx.practitionerProfileId ?? "__none__"
      : opts.practitionerId;

  return prisma.leaveRequest.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(practitionerId ? { practitionerId } : {}),
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
    orderBy: [{ status: "asc" }, { startDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function createLeaveRequest(
  ctx: AuthContext,
  input: z.infer<typeof createLeaveRequestSchema>,
) {
  const startDate = parseDateOnly(input.startDate);
  const endDate = parseDateOnly(input.endDate || input.startDate);
  if (endDate.getTime() < startDate.getTime()) {
    throw badRequest("End date must be on or after start date");
  }
  const days = eachDateInclusive(startDate, endDate);
  if (days.length > 60) {
    throw badRequest("Leave requests are limited to 60 days at a time");
  }

  const allDay = input.allDay !== false;
  if (!allDay) {
    if (input.startMinute == null || input.endMinute == null) {
      throw badRequest("Provide start and end times, or choose all day");
    }
    if (input.endMinute <= input.startMinute) {
      throw badRequest("End time must be after start time");
    }
  }

  const practitioner = await prisma.practitionerProfile.findFirst({
    where: {
      id: input.practitionerId,
      membership: { clinicId: ctx.clinicId },
      active: true,
    },
  });
  if (!practitioner) throw notFound("Practitioner not found");
  assertCanRequestFor(ctx, input.practitionerId, practitioner.id);

  // Owner/reception can grant leave immediately; practitioners need approval
  const autoApprove = ctx.role === "OWNER" || ctx.role === "RECEPTION";

  const request = await prisma.leaveRequest.create({
    data: {
      clinicId: ctx.clinicId,
      practitionerId: practitioner.id,
      startDate,
      endDate,
      reason: input.reason.trim() || "Annual leave",
      allDay,
      startMinute: allDay ? null : (input.startMinute ?? null),
      endMinute: allDay ? null : (input.endMinute ?? null),
      status: autoApprove
        ? LeaveRequestStatus.APPROVED
        : LeaveRequestStatus.PENDING,
      requestedByUserId: ctx.userId,
      ...(autoApprove
        ? {
            reviewedByUserId: ctx.userId,
            reviewedAt: new Date(),
          }
        : {}),
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
  });

  if (autoApprove) {
    await materialiseApprovedLeave(request.id);
    return prisma.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        practitioner: { select: { id: true, displayName: true, colour: true } },
      },
    });
  }

  return request;
}

async function materialiseApprovedLeave(leaveRequestId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
  });
  if (!request || request.status !== LeaveRequestStatus.APPROVED) return;

  const days = eachDateInclusive(request.startDate, request.endDate);
  for (const date of days) {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: request.clinicId,
        practitionerId: request.practitionerId,
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
        startsAt: { lte: dayEnd },
        endsAt: { gte: dayStart },
      },
    });

    const blockStart = request.startMinute ?? 0;
    const blockEnd = request.endMinute ?? 24 * 60;
    for (const apt of appointments) {
      const aptStart =
        apt.startsAt.getUTCHours() * 60 + apt.startsAt.getUTCMinutes();
      const aptEnd =
        apt.endsAt.getUTCHours() * 60 + apt.endsAt.getUTCMinutes();
      if (aptStart < blockEnd && aptEnd > blockStart) {
        throw conflict(
          "Cannot approve leave that overlaps an existing appointment — reschedule patients first",
        );
      }
    }

    await prisma.availabilityException.create({
      data: {
        practitionerId: request.practitionerId,
        date,
        isAvailable: false,
        startMinute: request.startMinute,
        endMinute: request.endMinute,
        reason: request.reason,
        kind: "LEAVE",
        leaveRequestId: request.id,
      },
    });
  }
}

export async function approveLeaveRequest(
  ctx: AuthContext,
  id: string,
  note?: string | null,
) {
  if (ctx.role !== "OWNER" && ctx.role !== "RECEPTION") {
    throw forbidden("Only owners or reception can approve leave");
  }

  const request = await prisma.leaveRequest.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!request) throw notFound("Leave request not found");
  if (request.status !== LeaveRequestStatus.PENDING) {
    throw badRequest("Only pending leave can be approved");
  }

  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: LeaveRequestStatus.APPROVED,
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  });

  await materialiseApprovedLeave(request.id);

  return prisma.leaveRequest.findUniqueOrThrow({
    where: { id: request.id },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
  });
}

export async function rejectLeaveRequest(
  ctx: AuthContext,
  id: string,
  note?: string | null,
) {
  if (ctx.role !== "OWNER" && ctx.role !== "RECEPTION") {
    throw forbidden("Only owners or reception can reject leave");
  }

  const request = await prisma.leaveRequest.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!request) throw notFound("Leave request not found");
  if (request.status !== LeaveRequestStatus.PENDING) {
    throw badRequest("Only pending leave can be rejected");
  }

  return prisma.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: LeaveRequestStatus.REJECTED,
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
  });
}

export async function cancelLeaveRequest(ctx: AuthContext, id: string) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!request) throw notFound("Leave request not found");

  const isOwnerOrReception =
    ctx.role === "OWNER" || ctx.role === "RECEPTION";
  const isOwn =
    ctx.role === "PRACTITIONER" &&
    ctx.practitionerProfileId === request.practitionerId;

  if (!isOwnerOrReception && !isOwn) {
    throw forbidden("Not allowed to cancel this leave request");
  }

  if (
    request.status !== LeaveRequestStatus.PENDING &&
    request.status !== LeaveRequestStatus.APPROVED
  ) {
    throw badRequest("This leave request cannot be cancelled");
  }

  // Practitioners may only cancel pending (not already-approved) leave
  if (isOwn && !isOwnerOrReception && request.status !== LeaveRequestStatus.PENDING) {
    throw forbidden("Ask reception or an owner to cancel approved leave");
  }

  await prisma.availabilityException.deleteMany({
    where: { leaveRequestId: request.id },
  });

  return prisma.leaveRequest.update({
    where: { id: request.id },
    data: {
      status: LeaveRequestStatus.CANCELLED,
      ...(isOwnerOrReception
        ? {
            reviewedByUserId: ctx.userId,
            reviewedAt: new Date(),
          }
        : {}),
    },
    include: {
      practitioner: { select: { id: true, displayName: true, colour: true } },
    },
  });
}

export { LEAVE_REASONS };
