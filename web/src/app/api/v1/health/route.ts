import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";
import { getEffectiveEmailProvider } from "@/modules/notifications/email";
import { rateLimitBackend } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness for uptime monitors.
 * Does not expose secrets; reports basic dependency reachability.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  let emailProvider: "resend" | "console" = "console";
  try {
    emailProvider = await getEffectiveEmailProvider();
  } catch {
    emailProvider = "console";
  }

  const smsRaw = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  const smsProvider =
    smsRaw === "twilio" &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
      ? "twilio"
      : "console";

  const cronConfigured =
    typeof process.env.CRON_SECRET === "string" &&
    process.env.CRON_SECRET.length >= 24;

  const ok = database === "ok";
  const body = {
    ok,
    service: "treow-clinic",
    time: new Date().toISOString(),
    regionHint: process.env.S3_REGION ?? process.env.DATA_REGION ?? "uk-eu",
    aiProvider: process.env.AI_PROVIDER ?? "mock",
    emailProvider,
    smsProvider,
    cronConfigured,
    rateLimitBackend: rateLimitBackend(),
    database,
    latencyMs: Date.now() - started,
  };

  return jsonOk(body, { status: ok ? 200 : 503 });
}
