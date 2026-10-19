import { prisma } from "@/server/db";
import { jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness for uptime monitors.
 * Intentionally minimal — do not advertise providers, cron, or rate-limit backend.
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
    },
    { status: ok ? 200 : 503 },
  );
}
