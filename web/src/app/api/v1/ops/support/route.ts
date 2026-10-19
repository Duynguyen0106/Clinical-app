import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { getAppBaseUrl, getSupportEmail } from "@/server/env";
import { getEffectiveEmailProvider } from "@/modules/notifications/email-config";

function smsDeliveryLive() {
  const provider = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  return (
    provider === "twilio" &&
    Boolean(
      process.env.TWILIO_ACCOUNT_SID?.trim() &&
        process.env.TWILIO_AUTH_TOKEN?.trim() &&
        process.env.TWILIO_FROM_NUMBER?.trim(),
    )
  );
}

function resolveSmsProvider(): "console" | "twilio" {
  const smsRaw = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  if (
    smsRaw === "twilio" &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    return "twilio";
  }
  return "console";
}

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  let patientEmailLive = false;
  try {
    patientEmailLive = (await getEffectiveEmailProvider()) === "resend";
  } catch {
    patientEmailLive = false;
  }
  return jsonOk({
    support: {
      email: getSupportEmail(),
      appBaseUrl: getAppBaseUrl(),
      privacyPath: "/privacy",
      smsProvider: resolveSmsProvider(),
      /** Plain-language delivery flags for Settings → Communications */
      messaging: {
        patientEmailLive,
        smsLive: smsDeliveryLive(),
      },
      docs: {
        launch: "docs/LAUNCH.md",
        compliance: "docs/UK_COMPLIANCE.md",
        deploy: "docs/DEPLOY.md",
      },
      jobs: {
        reminders: "POST /api/v1/jobs/reminders",
        patientEmails: "POST /api/v1/jobs/patient-emails",
        retention: "POST /api/v1/jobs/retention",
      },
    },
  });
});
