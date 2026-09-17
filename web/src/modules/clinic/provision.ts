import { z } from "zod";
import { MembershipRole, SaasPlan, SaasSubscriptionStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict } from "@/server/errors";
import { hashPassword } from "@/modules/auth/service";
import { MSK_TEMPLATE_PACK } from "@/modules/notes/templates";

export const provisionClinicSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  timezone: z.string().min(3).max(64).optional(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(240).optional().nullable(),
  plan: z.enum(["PILOT", "STARTER", "CLINIC", "GROUP"]).optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  owner: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(120),
    password: z.string().min(8).max(200),
  }),
  /** Seed a default location + couch + core services */
  seedDefaults: z.boolean().optional(),
});

export type ProvisionClinicInput = z.infer<typeof provisionClinicSchema>;

export async function provisionClinic(input: ProvisionClinicInput) {
  const slug = input.slug.toLowerCase().trim();
  const ownerEmail = input.owner.email.toLowerCase().trim();
  const existingSlug = await prisma.clinic.findUnique({ where: { slug } });
  if (existingSlug) throw conflict("Clinic slug already exists");

  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });
  if (existingUser) {
    throw conflict("Owner email already has a Treow account");
  }

  const trialDays = input.trialDays ?? 30;
  const plan = (input.plan ?? "PILOT") as SaasPlan;
  const passwordHash = await hashPassword(input.owner.password);

  const clinic = await prisma.$transaction(async (tx) => {
    const created = await tx.clinic.create({
      data: {
        name: input.name.trim(),
        slug,
        timezone: input.timezone ?? "Europe/London",
        phone: input.phone ?? null,
        email: input.email ?? ownerEmail,
        address: input.address ?? null,
        saasPlan: plan,
        saasStatus:
          plan === "PILOT"
            ? SaasSubscriptionStatus.TRIALING
            : SaasSubscriptionStatus.TRIALING,
        saasTrialEndsAt: new Date(
          Date.now() + trialDays * 24 * 60 * 60 * 1000,
        ),
      },
    });

    const owner = await tx.user.create({
      data: {
        email: ownerEmail,
        name: input.owner.name.trim(),
        passwordHash,
      },
    });

    const membership = await tx.membership.create({
      data: {
        clinicId: created.id,
        userId: owner.id,
        role: MembershipRole.OWNER,
      },
    });

    await tx.practitionerProfile.create({
      data: {
        membershipId: membership.id,
        displayName: input.owner.name.trim(),
        colour: "#0F6B5C",
        active: true,
      },
    });

    if (input.seedDefaults !== false) {
      const location = await tx.location.create({
        data: {
          clinicId: created.id,
          name: "Main clinic",
          address: input.address ?? null,
        },
      });
      await tx.room.create({
        data: {
          clinicId: created.id,
          locationId: location.id,
          name: "Couch 1",
        },
      });
      await tx.appointmentType.createMany({
        data: [
          {
            clinicId: created.id,
            name: "Initial assessment",
            durationMinutes: 45,
            defaultPriceCents: 7500,
            onlineBookable: true,
          },
          {
            clinicId: created.id,
            name: "Follow-up",
            durationMinutes: 30,
            defaultPriceCents: 5500,
            onlineBookable: true,
          },
        ],
      });
      for (const tpl of MSK_TEMPLATE_PACK.slice(0, 3)) {
        await tx.noteTemplate.create({
          data: {
            clinicId: created.id,
            name: tpl.name,
            isDefault: Boolean(tpl.isDefault),
            schema: { sections: tpl.sections },
          },
        });
      }
    }

    return { clinic: created, ownerEmail, ownerName: owner.name };
  });

  return clinic;
}

export function parseProvisionBody(body: unknown) {
  const parsed = provisionClinicSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
  }
  return parsed.data;
}
