import { createHash, randomBytes } from "node:crypto";
import type { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "./db";
import { forbidden, unauthorized } from "./errors";
import { rawSessionTokenFromRequest } from "./session-cookie";

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  clinicId: string;
  role: MembershipRole;
  membershipId: string;
  practitionerProfileId: string | null;
};

const SESSION_DAYS = 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const raw = randomBytes(32).toString("hex");
  const token = hashToken(raw);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  return { accessToken: raw, expiresAt };
}

export async function revokeSession(rawToken: string) {
  await prisma.session.deleteMany({ where: { token: hashToken(rawToken) } });
}

export async function resolveAuth(
  request: Request,
  clinicIdHeader?: string | null,
): Promise<AuthContext> {
  const raw = rawSessionTokenFromRequest(request);
  if (!raw) throw unauthorized("Missing session");

  const session = await prisma.session.findUnique({
    where: { token: hashToken(raw) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          memberships: {
            select: {
              id: true,
              clinicId: true,
              role: true,
              practitionerProfile: {
                select: { id: true, active: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    throw unauthorized("Invalid or expired session");
  }

  const memberships = session.user.memberships;
  if (memberships.length === 0) {
    throw forbidden("User has no clinic membership");
  }

  const preferredClinicId =
    clinicIdHeader ?? request.headers.get("x-clinic-id");

  const membership =
    (preferredClinicId
      ? memberships.find((m) => m.clinicId === preferredClinicId)
      : undefined) ?? memberships[0];

  if (!membership) {
    throw forbidden("Not a member of this clinic");
  }

  // Deactivated diary profiles must not keep using the API as that clinic's practitioner
  if (
    membership.practitionerProfile &&
    membership.practitionerProfile.active === false
  ) {
    throw unauthorized("This account has been deactivated");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    clinicId: membership.clinicId,
    role: membership.role,
    membershipId: membership.id,
    practitionerProfileId: membership.practitionerProfile?.id ?? null,
  };
}

export function requireRole(
  ctx: AuthContext,
  roles: MembershipRole[],
) {
  if (!roles.includes(ctx.role)) {
    throw forbidden(`Requires one of: ${roles.join(", ")}`);
  }
}
