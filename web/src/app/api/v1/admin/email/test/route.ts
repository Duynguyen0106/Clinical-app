import { z } from "zod";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import { isAdminProvisionAuthorized } from "@/server/admin-auth";
import { sendEmail } from "@/modules/notifications/email";
import { loadEmailRuntimeConfig } from "@/modules/notifications/email-config";
import { buildBookingConfirmationEmail } from "@/modules/notifications/booking-confirmation-email";

const bodySchema = z.object({
  to: z.string().email(),
});

/** Send a sample booking confirmation to verify Resend delivery. */
export const POST = withPublic(async (req) => {
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
    cancelNoticeHours: 2,
  });

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      replyTo: "nguyensosteopathy@gmail.com",
    });
    return jsonOk({
      ok: true,
      result,
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
