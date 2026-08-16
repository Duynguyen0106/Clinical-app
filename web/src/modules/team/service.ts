import { z } from "zod";
import { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { badRequest, conflict, notFound } from "@/server/errors";
import { hashPassword } from "@/modules/auth/service";

const daySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(1).max(24 * 60),
});

export const createPractitionerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
  colour: z.string().max(20).optional(),
  /** If omitted, Mon–Fri 09:00–17:00 */
  availability: z.array(daySchema).optional(),
});

export const updateAvailabilitySchema = z.object({
  rules: z.array(daySchema).min(0).max(14),
});

export const updatePractitionerSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  colour: z.string().max(20).optional(),
  active: z.boolean().optional(),
});

const DEFAULT_WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function assertValidRules(
  rules: { dayOfWeek: number; startMinute: number; endMinute: number }[],
) {
  for (const r of rules) {
    if (r.endMinute <= r.startMinute) {
      throw badRequest("Each day end must be after start");
    }
  }
}

export async function listTeam(ctx: AuthContext) {
  return prisma.practitionerProfile.findMany({
    where: { membership: { clinicId: ctx.clinicId } },
    include: {
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      membership: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
    orderBy: { displayName: "asc" },
  });
}

export async function createPractitioner(
  ctx: AuthContext,
  input: z.infer<typeof createPractitionerSchema>,
) {
  const email = input.email.toLowerCase().trim();
  const rules = input.availability ?? DEFAULT_WEEKDAY_HOURS;
  assertValidRules(rules);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await prisma.membership.findUnique({
      where: {
        clinicId_userId: { clinicId: ctx.clinicId, userId: existingUser.id },
      },
    });
    if (already) throw conflict("This email is already on the clinic team");
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
        },
      }));

    if (existingUser) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: input.name.trim(),
          passwordHash,
        },
      });
    }

    const membership = await tx.membership.create({
      data: {
        clinicId: ctx.clinicId,
        userId: user.id,
        role: MembershipRole.PRACTITIONER,
      },
    });

    const profile = await tx.practitionerProfile.create({
      data: {
        membershipId: membership.id,
        displayName: input.displayName.trim(),
        colour: input.colour ?? "#1E3F37",
        active: true,
        availability: {
          create: rules.map((r) => ({
            dayOfWeek: r.dayOfWeek,
            startMinute: r.startMinute,
            endMinute: r.endMinute,
          })),
        },
      },
      include: {
        availability: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
        membership: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    return profile;
  });

  return result;
}

export async function updatePractitioner(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof updatePractitionerSchema>,
) {
  const profile = await prisma.practitionerProfile.findFirst({
    where: { id, membership: { clinicId: ctx.clinicId } },
  });
  if (!profile) throw notFound("Practitioner not found");

  return prisma.practitionerProfile.update({
    where: { id: profile.id },
    data: {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName.trim() }
        : {}),
      ...(input.colour !== undefined ? { colour: input.colour } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: {
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      membership: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
}

export async function replaceAvailability(
  ctx: AuthContext,
  practitionerId: string,
  input: z.infer<typeof updateAvailabilitySchema>,
) {
  assertValidRules(input.rules);

  const profile = await prisma.practitionerProfile.findFirst({
    where: { id: practitionerId, membership: { clinicId: ctx.clinicId } },
  });
  if (!profile) throw notFound("Practitioner not found");

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({
      where: { practitionerId: profile.id },
    }),
    prisma.availabilityRule.createMany({
      data: input.rules.map((r) => ({
        practitionerId: profile.id,
        dayOfWeek: r.dayOfWeek,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    }),
  ]);

  return prisma.practitionerProfile.findFirstOrThrow({
    where: { id: profile.id },
    include: {
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      membership: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
}
