import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";

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

  const ok = database === "ok";
  const body = {
    ok,
    service: "treow-clinic",
    time: new Date().toISOString(),
    regionHint: process.env.S3_REGION ?? process.env.DATA_REGION ?? "uk-eu",
    aiProvider: process.env.AI_PROVIDER ?? "mock",
    emailProvider: process.env.EMAIL_PROVIDER ?? "console",
    database,
    latencyMs: Date.now() - started,
  };

  return jsonOk(body, { status: ok ? 200 : 503 });
}
