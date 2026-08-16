import type { NextRequest } from "next/server";
import type { MembershipRole } from "@/generated/prisma/client";
import type { AuthContext } from "@/server/auth";
import { resolveAuth, requireRole } from "@/server/auth";
import { jsonError } from "@/server/http";
import { timingSafeEqual } from "node:crypto";

export function getCronSecret() {
  return process.env.CRON_SECRET?.trim() || "";
}

export function isCronAuthorized(req: Request): boolean {
  const secret = getCronSecret();
  if (!secret || secret.length < 16) return false;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  if (token.length !== secret.length) return false;

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

type CronOrStaffHandler = (
  req: NextRequest,
  ctx: { mode: "cron" } | { mode: "staff"; auth: AuthContext },
  params: Record<string, string>,
) => Promise<Response>;

/**
 * Accepts CRON_SECRET Bearer **or** a staff session (roles required for staff).
 */
export function withCronOrStaff(
  staffRoles: MembershipRole[],
  handler: CronOrStaffHandler,
) {
  return async (
    req: NextRequest,
    route?: { params: Promise<Record<string, string>> },
  ) => {
    try {
      const params = route?.params ? await route.params : {};
      if (isCronAuthorized(req)) {
        return await handler(req, { mode: "cron" }, params);
      }
      const auth = await resolveAuth(req);
      requireRole(auth, staffRoles);
      return await handler(req, { mode: "staff", auth }, params);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function assertCronConfiguredInProduction() {
  if (process.env.NODE_ENV !== "production") return;
  const secret = getCronSecret();
  if (!secret || secret.length < 24) {
    console.warn(
      "[treow] CRON_SECRET missing or short — unattended reminder/retention/organise jobs will fail until set.",
    );
  }
}
