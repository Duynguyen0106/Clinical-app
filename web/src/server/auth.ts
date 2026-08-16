import { createHash, randomBytes } from "node:crypto";
import type { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "./db";
import { forbidden, unauthorized } from "./errors";

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
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw unauthorized("Missing Bearer token");
  }

  const raw = auth.slice("Bearer ".length).trim();
  if (!raw) throw unauthorized("Missing Bearer token");

  const session = await prisma.session.findUnique({
    where: { token: hashToken(raw) },
    include: {
      user: {
        include: {
          memberships: {
            include: { practitionerProfile: true },
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
