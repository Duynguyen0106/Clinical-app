import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

function emailProvider() {
  return (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
}

function smsProvider() {
  return (process.env.SMS_PROVIDER ?? "console").toLowerCase();
}

function paymentProvider() {
  return (process.env.PAYMENT_PROVIDER ?? "console").toLowerCase();
}

function cronConfigured() {
  const cron = process.env.CRON_SECRET?.trim() ?? "";
  return cron.length >= 24;
}

function rateLimitBackend() {
  if (
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  ) {
    return "upstash";
  }
  return "memory";
}

/**
 * Unauthenticated liveness for uptime monitors + launch checklist.
 * Reports provider *names* only — never keys or secrets.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  const ok = database === "ok";
  return jsonOk(
    {
      ok,
      service: "treow-clinic",
      time: new Date().toISOString(),
      database,
      latencyMs: Date.now() - started,
      emailProvider: emailProvider(),
      smsProvider: smsProvider(),
      paymentProvider: paymentProvider(),
      cronConfigured: cronConfigured(),
      rateLimitBackend: rateLimitBackend(),
    },
    { status: ok ? 200 : 503 },
  );
}
