import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";
import { getEffectiveEmailProvider } from "@/modules/notifications/email";

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

  const ok = database === "ok";
  const body = {
    ok,
    service: "treow-clinic",
    time: new Date().toISOString(),
    regionHint: process.env.S3_REGION ?? process.env.DATA_REGION ?? "uk-eu",
    aiProvider: process.env.AI_PROVIDER ?? "mock",
    emailProvider,
    database,
    latencyMs: Date.now() - started,
  };

  return jsonOk(body, { status: ok ? 200 : 503 });
}
