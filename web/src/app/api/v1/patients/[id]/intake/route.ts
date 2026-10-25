import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatientIntakeStatus,
  recordIntakeViewed,
  staffResendIntake,
} from "@/modules/intake/service";
import { sendIntakeConsentEmail } from "@/modules/notifications/appointments";
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

export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = postSchema.parse(await req.json().catch(() => ({})));

  if (body.action !== "resend") {
    return jsonOk({ ok: false });
  }

  const result = await staffResendIntake(ctx, {
    patientId: params.id,
    appointmentId: body.appointmentId,
  });

  const appointmentId =
    body.appointmentId ??
    (
      await prisma.appointment.findFirst({
        where: {
          clinicId: ctx.clinicId,
          patientId: params.id,
          startsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        select: { id: true },
      })
    )?.id ??
    null;

  if (appointmentId) {
    const sent = await sendIntakeConsentEmail(appointmentId, { force: true });
    return jsonOk({ ok: true, sent, url: result.url });
  }

  if (!result.url || !result.patient.email) {
    return jsonOk({
      ok: true,
      sent: false,
      alreadyComplete: result.alreadyComplete,
    });
  }

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: ctx.clinicId },
    select: { name: true, phone: true, email: true },
  });
  const content = buildIntakeConsentEmail({
    clinicName: clinic.name,
    clinicPhone: clinic.phone,
    patientFirstName: result.patient.firstName,
    intakeLink: result.url,
  });
  const emailResult = await sendEmail({
    to: result.patient.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: clinic.email,
  });
  return jsonOk({
    ok: true,
    sent: emailResult.delivered || emailResult.provider === "console",
    url: result.url,
  });
});
