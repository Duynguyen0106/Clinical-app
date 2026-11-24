import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

function cronConfigured() {
  const cron = process.env.CRON_SECRET?.trim() ?? "";
  return cron.length >= 24;
}

/**
 * Unauthenticated liveness for uptime monitors.
 * Does not disclose provider backends (email/sms/payment/rate-limit).
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
      cronConfigured: cronConfigured(),
    },
    { status: ok ? 200 : 503 },
  );
}
