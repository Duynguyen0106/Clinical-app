import { z } from "zod";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { withClinicTransaction } from "@/server/clinic-rls";
import { verifyEmailPrefsToken } from "./email-prefs-token";

export const emailPrefsActionSchema = z.object({
  token: z.string().min(8).max(500),
  action: z.enum(["unsubscribe_marketing"]),
});

export async function loadEmailPrefs(token: string) {
  const { patientId, clinicId } = verifyEmailPrefsToken(token);
  // Clinic + PatientConsent under FORCE: short explicit tx (not request-long).
  return withClinicTransaction(clinicId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId },
      select: {
        id: true,
        firstName: true,
        email: true,
        clinic: { select: { id: true, name: true, slug: true } },
        consents: {
          where: { type: "MARKETING" },
          orderBy: { capturedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!patient) throw notFound("Patient not found");
    const marketing = patient.consents[0];
    return {
      clinicName: patient.clinic.name,
      clinicSlug: patient.clinic.slug,
      patientFirstName: patient.firstName,
      email: patient.email,
      marketingOptedIn: Boolean(marketing?.granted),
    };
  });
}

/** Revoke MARKETING consent (insert a granted=false row; senders require granted:true). */
export async function unsubscribeMarketing(token: string) {
  const { patientId, clinicId } = verifyEmailPrefsToken(token);
  return withClinicTransaction(clinicId, async (tx) => {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true, clinic: { select: { name: true } } },
    });
    if (!patient) throw notFound("Patient not found");

    await tx.patientConsent.create({
      data: {
        patientId: patient.id,
        type: "MARKETING",
        granted: false,
        method: "online_form",
        meta: { source: "email_prefs_unsubscribe" },
      },
    });

    return {
      clinicName: patient.clinic.name,
      marketingOptedIn: false,
    };
  });
}
