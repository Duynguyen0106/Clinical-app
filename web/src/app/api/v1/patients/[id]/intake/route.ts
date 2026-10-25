import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatientIntakeStatus,
  recordIntakeViewed,
  staffPrepareIntakeSend,
} from "@/modules/intake/service";
import { sendEmail } from "@/modules/notifications/email";
import { buildIntakeConsentEmail } from "@/modules/notifications/intake-consent-email";
import { prisma } from "@/server/db";
import { z } from "zod";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const status = await getPatientIntakeStatus(ctx, params.id);
  if (status.submission?.status === "COMPLETED") {
    recordIntakeViewed(ctx, params.id, status.submission.id);
  }
  return jsonOk(status);
});

const postSchema = z.object({
  action: z.enum(["resend"]),
  appointmentId: z.string().optional().nullable(),
});

/**
 * Single prepare → email path (no dual ensure).
 * appointmentId is validated inside staffPrepareIntakeSend (clinic + patient).
 */
export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = postSchema.parse(await req.json().catch(() => ({})));

  if (body.action !== "resend") {
    return jsonOk({ ok: false });
  }

  const prepared = await staffPrepareIntakeSend(ctx, {
    patientId: params.id,
    appointmentId: body.appointmentId,
  });

  if (prepared.alreadyComplete) {
    return jsonOk({
      ok: true,
      sent: false,
      alreadyComplete: true,
      submissionId: prepared.submissionId,
    });
  }

  if (!prepared.url || !prepared.patient.email) {
    return jsonOk({
      ok: true,
      sent: false,
      alreadyComplete: false,
      submissionId: prepared.submissionId,
    });
  }

  let whenLabel: string | undefined;
  let practitionerName: string | undefined;
  let serviceName: string | undefined;
  if (prepared.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: {
        id: prepared.appointmentId,
        clinicId: ctx.clinicId,
        patientId: params.id,
      },
      select: {
        startsAt: true,
        appointmentType: { select: { name: true } },
        practitioner: { select: { displayName: true } },
        clinic: { select: { timezone: true } },
      },
    });
    if (apt) {
      whenLabel = apt.startsAt.toLocaleString("en-GB", {
        timeZone: apt.clinic.timezone || "Europe/London",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      practitionerName = apt.practitioner.displayName;
      serviceName = apt.appointmentType.name;
    }
  }

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { name: true, phone: true, email: true },
  });
  const content = buildIntakeConsentEmail({
    clinicName: clinic.name,
    clinicPhone: clinic.phone,
    patientFirstName: prepared.patient.firstName,
    intakeLink: prepared.url,
    whenLabel,
    practitionerName,
    serviceName,
  });
  const emailResult = await sendEmail({
    to: prepared.patient.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: clinic.email,
  });

  return jsonOk({
    ok: true,
    sent: emailResult.delivered || emailResult.provider === "console",
    alreadyComplete: false,
    url: prepared.url,
    submissionId: prepared.submissionId,
  });
});
