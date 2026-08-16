import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession, revokeSession } from "@/server/auth";
import { unauthorized } from "@/server/errors";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clinicSlug: z.string().optional(),
});

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: {
      memberships: {
        include: {
          clinic: true,
          practitionerProfile: true,
        },
      },
    },
  });

  if (!user?.passwordHash) throw unauthorized("Invalid email or password");

  const ok = await compare(input.password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid email or password");

  let membership = user.memberships[0];
  if (input.clinicSlug) {
    const match = user.memberships.find(
      (m) => m.clinic.slug === input.clinicSlug,
    );
    if (!match) throw unauthorized("Not a member of that clinic");
    membership = match;
  }

  if (!membership) throw unauthorized("No clinic membership");

  const session = await createSession(user.id);

  return {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    clinic: {
      id: membership.clinic.id,
      name: membership.clinic.name,
      slug: membership.clinic.slug,
      timezone: membership.clinic.timezone,
    },
    role: membership.role,
    practitionerProfileId: membership.practitionerProfile?.id ?? null,
  };
}

export async function logout(rawToken: string) {
  await revokeSession(rawToken);
}

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function getMe(userId: string, clinicId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      clinicId_userId: { clinicId, userId },
    },
    include: {
      user: true,
      clinic: true,
      practitionerProfile: true,
    },
  });
  if (!membership) throw unauthorized();

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
    },
    clinic: {
      id: membership.clinic.id,
      name: membership.clinic.name,
      slug: membership.clinic.slug,
      timezone: membership.clinic.timezone,
    },
    role: membership.role,
    practitionerProfileId: membership.practitionerProfile?.id ?? null,
  };
}
