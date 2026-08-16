import type { MembershipRole } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { requireRole } from "@/server/auth";

/** Clinical documentation — practitioners & owners */
export function requireClinician(ctx: AuthContext) {
  requireRole(ctx, ["OWNER", "PRACTITIONER"]);
}

/** Alias used by visit/appointment mutation routes */
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

export function canMutateClinical(role: MembershipRole) {
  return role === "OWNER" || role === "PRACTITIONER";
}

/** Same roles as canMutateClinical — clinical record need-to-know */
export function canAccessClinicalRecord(role: MembershipRole) {
  return canMutateClinical(role);
}
