import { z } from "zod";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import { isAdminProvisionAuthorized } from "@/server/admin-auth";
import { enforceAdminEmailTestLimits } from "@/server/abuse";
import { sendEmail } from "@/modules/notifications/email";
import { loadEmailRuntimeConfig } from "@/modules/notifications/email-config";
import { buildBookingConfirmationEmail } from "@/modules/notifications/booking-confirmation-email";
import { buildAppointmentIcs } from "@/modules/notifications/appointment-ics";

const bodySchema = z.object({
  to: z.string().email(),
});

/** Send a sample booking confirmation (+ ICS) to verify Resend delivery. */
export const POST = withPublic(async (req) => {
  await enforceAdminEmailTestLimits(req);
  if (!isAdminProvisionAuthorized(req)) {
    throw unauthorized("Invalid provision secret");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw badRequest("Valid 'to' email required");

  const cfg = await loadEmailRuntimeConfig({ bypassCache: true });
  const content = buildBookingConfirmationEmail({
    clinicName: "Nguyen's Osteopathic Clinic",
    clinicPhone: "+447882843513",
    clinicAddress: "52 Powis Street, Woolwich, London, SE18 6LQ",
    patientFirstName: "Test",
    whenLabel: "Monday 9 November 2026 at 09:00",
    timezone: "Europe/London",
    practitionerName: "Austin Nguyen",
    serviceName: "Follow-up Osteopathic Treatment",
    roomName: "Couch 1",
    manageLink: "https://treow-clinic.vercel.app/book/manage/demo",
    cancelNoticeHours: 24,
  });
  const startsAt = new Date("2026-11-09T09:00:00.000Z");
  const endsAt = new Date("2026-11-09T09:30:00.000Z");
  const ics = buildAppointmentIcs({
    appointmentId: "sample-booking-confirm",
    clinicSlug: "nguyens-osteopathy",
    clinicName: "Nguyen's Osteopathic Clinic",
    clinicEmail: "nguyensosteopathy@gmail.com",
    clinicPhone: "+447882843513",
    clinicAddress: "52 Powis Street, Woolwich, London, SE18 6LQ",
    patientFirstName: "Test",
    patientEmail: parsed.data.to,
    practitionerName: "Austin Nguyen",
    serviceName: "Follow-up Osteopathic Treatment",
    roomName: "Couch 1",
    startsAt,
    endsAt,
    manageLink: "https://treow-clinic.vercel.app/book/manage/demo",
    method: "REQUEST",
    sequence: 0,
  });

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      replyTo: "nguyensosteopathy@gmail.com",
      attachments: [
        {
          filename: ics.filename,
          content: ics.content,
          contentType: ics.contentType,
        },
      ],
    });
    return jsonOk({
      ok: true,
      result,
      icsAttached: true,
      config: {
        provider: cfg.provider,
        hasApiKey: Boolean(cfg.apiKey),
        from: cfg.from,
      },
    });
  } catch (err) {
    return jsonOk({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      config: {
        provider: cfg.provider,
        hasApiKey: Boolean(cfg.apiKey),
        from: cfg.from,
      },
    });
  }
});
