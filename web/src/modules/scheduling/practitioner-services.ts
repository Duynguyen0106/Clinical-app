import { prisma } from "@/server/db";
import { badRequest } from "@/server/errors";

/**
 * Empty PractitionerService rows = practitioner offers every active clinic type.
 * When any rows exist, booking must use a linked appointment type.
 */
export async function assertPractitionerOffersType(opts: {
  practitionerId: string;
  appointmentTypeId: string;
}) {
  const links = await prisma.practitionerService.findMany({
    where: { practitionerId: opts.practitionerId },
    select: { appointmentTypeId: true },
  });
  if (links.length === 0) return;
  if (!links.some((l) => l.appointmentTypeId === opts.appointmentTypeId)) {
    throw badRequest("This practitioner does not offer that service");
  }
}

export async function listPractitionerServiceIds(
  practitionerId: string,
): Promise<string[] | null> {
  const links = await prisma.practitionerService.findMany({
    where: { practitionerId },
    select: { appointmentTypeId: true },
  });
  if (links.length === 0) return null;
  return links.map((l) => l.appointmentTypeId);
}

export async function setPractitionerServices(
  practitionerId: string,
  appointmentTypeIds: string[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.practitionerService.deleteMany({ where: { practitionerId } });
    if (appointmentTypeIds.length === 0) return;
    await tx.practitionerService.createMany({
      data: appointmentTypeIds.map((appointmentTypeId) => ({
        practitionerId,
        appointmentTypeId,
      })),
      skipDuplicates: true,
    });
  });
}
