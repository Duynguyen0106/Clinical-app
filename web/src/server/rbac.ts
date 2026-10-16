import type { MembershipRole } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { requireRole } from "@/server/auth";
import { forbidden } from "@/server/errors";

/** Clinical documentation — practitioners & owners */
export function requireClinician(ctx: AuthContext) {
  requireRole(ctx, ["OWNER", "PRACTITIONER"]);
}

/**
 * Practitioners may only access their own diary visits/notes.
 * Owners may access any clinician record in the clinic.
 */
export function assertOwnsDiaryOrOwner(
  ctx: AuthContext,
  practitionerId: string | null | undefined,
) {
  requireClinician(ctx);
  if (ctx.role === "OWNER") return;
  if (
    !ctx.practitionerProfileId ||
    !practitionerId ||
    ctx.practitionerProfileId !== practitionerId
  ) {
    throw forbidden("You can only access visits and notes on your own diary");
  }
}

/** Alias used by visit / clinical note mutation routes */
export function assertCanMutateClinical(ctx: AuthContext) {
  requireClinician(ctx);
}

/** Clinical note bodies, transcripts, and prep history disclosure */
export function assertCanAccessClinicalRecord(ctx: AuthContext) {
  requireClinician(ctx);
}

/** Front desk + clinicians */
export function requireStaff(ctx: AuthContext) {
  requireRole(ctx, ["OWNER", "PRACTITIONER", "RECEPTION"]);
}

/** Money / settings mutations */
export function requireOwnerOrReception(ctx: AuthContext) {
  requireRole(ctx, ["OWNER", "RECEPTION"]);
}

/**
 * Diary schedule changes (reschedule, cancel, duration, no-show).
 * Reception + owners — not practitioners.
 */
export function requireScheduleManager(ctx: AuthContext) {
  requireRole(ctx, ["OWNER", "RECEPTION"]);
}

export function assertCanManageSchedule(ctx: AuthContext) {
  requireScheduleManager(ctx);
}

export function canMutateClinical(role: MembershipRole) {
  return role === "OWNER" || role === "PRACTITIONER";
}

/** Same roles as canMutateClinical — clinical record need-to-know */
export function canAccessClinicalRecord(role: MembershipRole) {
  return canMutateClinical(role);
}

export function canManageSchedule(role: MembershipRole) {
  return role === "OWNER" || role === "RECEPTION";
}
