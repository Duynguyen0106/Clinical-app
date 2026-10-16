import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export type ScheduleAuditAction =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "status_changed"
  | "patient_cancelled"
  | "patient_rescheduled"
  | "series_created";

export async function recordScheduleAudit(opts: {
  clinicId: string;
  appointmentId: string;
  actorId?: string | null;
  action: ScheduleAuditAction;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.appointmentAuditEvent.create({
      data: {
        clinicId: opts.clinicId,
        appointmentId: opts.appointmentId,
        actorId: opts.actorId ?? null,
        action: opts.action,
        meta: (opts.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Audit must not block diary mutations
    console.error("Schedule audit write failed", err);
  }
}
