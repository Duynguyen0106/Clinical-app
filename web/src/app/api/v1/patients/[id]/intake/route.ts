import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatientIntakeStatus,
  recordIntakeViewed,
  staffPrepareIntakeSend,
  staffRequestReconsent,
} from "@/modules/intake/service";
import { sendEmail } from "@/modules/notifications/email";
import { sendSms } from "@/modules/notifications/sms";
import { buildIntakeConsentEmail } from "@/modules/notifications/intake-consent-email";
import { prisma } from "@/server/db";
import { z } from "zod";

export const GET = withAuth(async (_req, ctx, params) => {
  requireStaff(ctx);
  const status = await getPatientIntakeStatus(ctx, params.id);
  if (status.submission) {
    recordIntakeViewed(ctx, params.id, status.submission.id, {
      status: status.submission.status,
    });
  }
  return jsonOk(status);
});

const postSchema = z.object({
  action: z.enum(["resend", "reconsent"]),
  appointmentId: z.string().optional().nullable(),
});

async function deliverPreparedConsent(
  ctx: { clinicId: string },
  prepared: {
    url: string | null;
    patient: {
      email: string | null;
      phone?: string | null;
      firstName: string;
    };
    appointmentId: string | null;
  },
  patientId: string,
) {
  if (!prepared.url) {
    return { sent: false, emailed: false, smsSent: false };
  }

  let whenLabel: string | undefined;
  let practitionerName: string | undefined;
  let serviceName: string | undefined;
  if (prepared.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: {
        id: prepared.appointmentId,
        clinicId: ctx.clinicId,
        patientId,
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

  let emailed = false;
  if (prepared.patient.email?.trim()) {
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
    emailed = emailResult.delivered || emailResult.provider === "console";
  }

  let smsSent = false;
  // SMS when phone-only, or as a short-link backup alongside email
  if (prepared.patient.phone?.trim() && (!emailed || !prepared.patient.email?.trim())) {
    const smsResult = await sendSms({
      to: prepared.patient.phone,
      body: [
        `${clinic.name}: please sign your consent forms (~2 min)`,
        prepared.url,
      ].join(" · "),
    });
    smsSent = smsResult.delivered || smsResult.provider === "console";
  }

  return {
    sent: emailed || smsSent,
    emailed,
    smsSent,
  };
}

/**
 * Single prepare → email/SMS path (no dual ensure).
 * appointmentId is validated inside staff prepare helpers (clinic + patient).
 */
export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = postSchema.parse(await req.json().catch(() => ({})));

  if (body.action === "reconsent") {
    const prepared = await staffRequestReconsent(ctx, {
      patientId: params.id,
      appointmentId: body.appointmentId,
    });
    const delivery = await deliverPreparedConsent(ctx, prepared, params.id);
    return jsonOk({
      ok: true,
      ...delivery,
      alreadyComplete: false,
      reconsent: true,
      submissionId: prepared.submissionId,
    });
  }

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

  const delivery = await deliverPreparedConsent(ctx, prepared, params.id);
  return jsonOk({
    ok: true,
    ...delivery,
    alreadyComplete: false,
    submissionId: prepared.submissionId,
  });
});
