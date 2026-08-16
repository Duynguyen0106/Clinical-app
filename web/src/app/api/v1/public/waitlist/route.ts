import { z } from "zod";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest, notFound } from "@/server/errors";
import { prisma } from "@/server/db";
import { verifyWaitlistOfferToken } from "@/modules/scheduling/waitlist-token";
import {
  acceptWaitlistOfferForClinic,
  declineWaitlistOfferForClinic,
} from "@/modules/scheduling/waitlist";
import { WaitlistStatus } from "@/generated/prisma/client";
import { enforcePublicWaitlistLimits } from "@/server/abuse";

const actionSchema = z.object({
  token: z.string().min(10),
  action: z.enum(["accept", "decline"]),
});

async function loadOffer(token: string) {
  const { entryId } = verifyWaitlistOfferToken(token);
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      appointmentType: { select: { name: true } },
      practitioner: { select: { displayName: true } },
      clinic: { select: { id: true, name: true, slug: true, timezone: true } },
    },
  });
  if (!entry) throw notFound("Offer not found");
  return entry;
}

export const GET = withPublic(async (req) => {
  enforcePublicWaitlistLimits(req);
  const token = new URL(req.url).searchParams.get("token");
  if (!token) throw badRequest("token required");
  const entry = await loadOffer(token);
  return jsonOk({
    offer: {
      id: entry.id,
      status: entry.status,
      startsAt: entry.offeredStartsAt,
      endsAt: entry.offeredEndsAt,
      expiresAt: entry.offerExpiresAt,
      serviceName: entry.appointmentType.name,
      practitionerName: entry.practitioner?.displayName ?? null,
      patientFirstName: entry.patient.firstName,
      clinic: entry.clinic,
      actionable: entry.status === WaitlistStatus.OFFERED,
    },
  });
});

export const POST = withPublic(async (req) => {
  enforcePublicWaitlistLimits(req);
  const body = actionSchema.parse(await req.json());
  const entry = await loadOffer(body.token);

  if (body.action === "accept") {
    const result = await acceptWaitlistOfferForClinic(entry.clinicId, entry.id);
    return jsonOk({
      ok: true,
      action: "accept",
      entry: {
        id: result.entry.id,
        status: result.entry.status,
      },
      appointment: {
        id: result.appointment.id,
        startsAt: result.appointment.startsAt,
      },
    });
  }

  const result = await declineWaitlistOfferForClinic(entry.clinicId, entry.id);
  return jsonOk({
    ok: true,
    action: "decline",
    entry: { id: result.entry.id, status: result.entry.status },
  });
});
